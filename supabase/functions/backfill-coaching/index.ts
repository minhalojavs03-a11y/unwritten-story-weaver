// Roda a análise de coaching INLINE (sem invocar outra edge) em mensagens
// outbound humanas dos últimos N dias, pulando o que já tem insights.
// Importante: evita rate limit edge-to-edge fazendo tudo no mesmo runtime.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const AUDIO_KEYWORDS = [
  "consórcio", "consorcio", "contemplação", "contemplacao", "lance",
  "carta de crédito", "carta de credito", "parcela", "parcelas", "reajuste",
  "taxa de administração", "taxa de admin", "fundo de reserva", "assembleia",
  "embolso", "amortização", "amortizacao", "lance livre", "lance fixo",
];

const BUYING_SIGNAL_KEYWORDS = [
  "valor", "preço", "preco", "parcela", "parcelas", "entrada", "simulação", "simulacao",
  "carta", "crédito", "credito", "contemplada", "contemplado", "contratar", "fechar",
  "começar", "comecar", "próximo passo", "proximo passo", "imóvel", "imovel",
  "carro", "moto", "financiamento", "quero", "tenho interesse", "mil", "k",
];

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function shouldBeAudio(text: string): { flag: boolean; reason: string } {
  if (!text) return { flag: false, reason: "" };
  const len = text.length;
  if (len < 320) return { flag: false, reason: "" };
  const lower = text.toLowerCase();
  const hits = AUDIO_KEYWORDS.filter(k => lower.includes(k));
  if (hits.length >= 1) {
    return {
      flag: true,
      reason: `Mensagem com ${len} caracteres explicando ${hits.slice(0, 3).join(", ")}. Áudio teria mais conexão e converteria melhor.`,
    };
  }
  if (len >= 500) {
    return {
      flag: true,
      reason: `Resposta com ${len} caracteres. Texto longo cansa — áudio passa mais confiança e fecha mais rápido.`,
    };
  }
  return { flag: false, reason: "" };
}

function hasBuyingSignalCandidate(text: string): boolean {
  const lower = text.toLowerCase();
  return BUYING_SIGNAL_KEYWORDS.some((k) => lower.includes(k)) || /\b\d{2,}(?:[.,]\d+)?\s*(k|mil)?\b/i.test(text);
}

async function markAnalyzed(admin: any, msg: any, result: { inserted?: number; clean?: number; skipped?: number; errors?: number }, errorMessage?: string) {
  if (!msg?.tenant_id || !msg?.id) return;
  await admin.from("coaching_message_analysis").upsert({
    tenant_id: msg.tenant_id,
    message_id: msg.id,
    conversation_id: msg.conversation_id,
    status: result.errors ? "error" : "processed",
    inserted_count: result.inserted ?? 0,
    clean_count: result.clean ?? 0,
    skipped_count: result.skipped ?? 0,
    error_message: errorMessage ?? null,
    analyzed_at: new Date().toISOString(),
  }, { onConflict: "message_id" });
}

async function callAI(systemPrompt: string, userPrompt: string): Promise<any> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (r.status === 429) {
      const wait = 5000 * (attempt + 1);
      console.log("AI 429 — waiting", wait, "ms");
      await new Promise(rs => setTimeout(rs, wait));
      continue;
    }
    if (!r.ok) { console.error("AI err", r.status, await r.text()); return null; }
    const d = await r.json();
    const content = d?.choices?.[0]?.message?.content ?? "";
    try { return JSON.parse(content); } catch { return null; }
  }
  return null;
}

async function analyzeOne(admin: any, m: { id: string; conversation_id: string }) {
  try {
    const { data: msg } = await admin.from("messages")
      .select("id, tenant_id, conversation_id, lead_id, body, content, direction, sent_by, created_at, message_type, metadata")
      .eq("id", m.id).maybeSingle();
    if (!msg) return { skipped: 1 };
    // Aceita outbound do CRM (sent_by != null) E também outbound vinda do
    // próprio WhatsApp do consultor (fromMe, sem sent_by) — desde que o lead
    // tenha consultor atribuído. Ignora mensagens da IA.
    const isAi = !!(msg.metadata && (msg.metadata as any).ai === true);
    if (msg.direction !== "outbound" || isAi) {
      const result = { skipped: 1 };
      await markAnalyzed(admin, msg, result);
      return result;
    }

    const text = (msg.body ?? msg.content ?? "").trim();
    if (!text) {
      const result = { skipped: 1 };
      await markAnalyzed(admin, msg, result);
      return result;
    }

    const { data: lead } = await admin.from("leads")
      .select("id, name, assigned_member_id")
      .eq("id", msg.lead_id ?? "").maybeSingle();
    const memberId = lead?.assigned_member_id ?? msg.sent_by;
    if (!memberId) {
      const result = { skipped: 1 };
      await markAnalyzed(admin, msg, result);
      return result;
    }

    const { data: prevInbound } = await admin.from("messages")
      .select("id, body, content, created_at")
      .eq("conversation_id", m.conversation_id)
      .eq("direction", "inbound")
      .lt("created_at", msg.created_at)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    const { data: history } = await admin.from("messages")
      .select("direction, body, content, created_at, sent_by")
      .eq("conversation_id", m.conversation_id)
      .order("created_at", { ascending: false }).limit(10);
    const ordered = (history ?? []).reverse();

    const inserts: any[] = [];

    if ((msg.message_type ?? "text") === "text") {
      const audio = shouldBeAudio(text);
      if (audio.flag) {
        inserts.push({
          tenant_id: msg.tenant_id, conversation_id: m.conversation_id,
          lead_id: msg.lead_id, member_id: memberId, message_id: msg.id,
          insight_type: "should_be_audio",
          severity: text.length > 600 ? "high" : "medium",
          title: "Deveria ter mandado áudio",
          detail: audio.reason,
          consultant_quote: text.slice(0, 400),
          suggestion: "Para explicações técnicas de consórcio, grave um áudio de 30-60s. Texto longo cansa e parece menos confiante.",
          metadata: { char_count: text.length },
        });
      }
    }

    if (prevInbound) {
      const inboundText = (prevInbound.body ?? prevInbound.content ?? "").trim();
      if (inboundText.length > 3 && hasBuyingSignalCandidate(inboundText)) {
        const histStr = ordered.map((mm: any) => `${mm.direction === "inbound" ? "CLIENTE" : "CONSULTOR"}: ${(mm.body ?? mm.content ?? "").slice(0, 300)}`).join("\n");
        const sys = `Você é um analista sênior de vendas de consórcio. Avalie se o CLIENTE deu um SINAL DE COMPRA CLARO e se o CONSULTOR aproveitou ou enrolou. Sinais: perguntar preço/parcela/entrada, como contratar, prazo, comparar com financiamento, próximos passos, urgência, pedir simulação.

Responda APENAS JSON:
{"is_buying_signal":bool,"signal_quote":"trecho cliente max 180","signal_strength":"high|medium|low","consultant_addressed":bool,"what_went_wrong":"1 frase","suggestion":"1-2 frases"}

Só marque is_buying_signal=true se for CLARO.`;
        const user = `HISTÓRICO:\n${histStr}\n\nÚLTIMA DO CLIENTE:\n"${inboundText}"\n\nRESPOSTA DO CONSULTOR:\n"${text}"`;
        const ai = await callAI(sys, user);
        if (ai && ai.is_buying_signal && ai.consultant_addressed === false) {
          inserts.push({
            tenant_id: msg.tenant_id, conversation_id: m.conversation_id,
            lead_id: msg.lead_id, member_id: memberId, message_id: msg.id,
            insight_type: "missed_buying_signal",
            severity: ai.signal_strength === "high" ? "high" : "medium",
            title: "Sinal de compra não aproveitado",
            detail: ai.what_went_wrong || "Cliente sinalizou intenção e a resposta não conduziu ao fechamento.",
            signal_quote: ai.signal_quote ?? inboundText.slice(0, 180),
            consultant_quote: text.slice(0, 400),
            suggestion: ai.suggestion ?? "Responda diretamente e conduza ao próximo passo (simulação, agendamento, fechamento).",
            metadata: { signal_strength: ai.signal_strength ?? "medium" },
          });
        }
      }
    }

    if (inserts.length) {
      const { error } = await admin.from("coaching_insights").insert(inserts);
      if (error) {
        console.error("insert err", error);
        const result = { errors: 1 };
        await markAnalyzed(admin, msg, result, error.message);
        return result;
      }
      const result = { inserted: inserts.length };
      await markAnalyzed(admin, msg, result);
      return result;
    }
    const result = { clean: 1 };
    await markAnalyzed(admin, msg, result);
    return result;
  } catch (e) {
    console.error("analyzeOne err", e);
    return { errors: 1 };
  }
}

async function runForTenant(admin: any, tenantId: string, days: number, limit: number) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data: msgs } = await admin.from("messages")
    .select("id, conversation_id")
    .eq("tenant_id", tenantId)
    .eq("direction", "outbound")
    .not("lead_id", "is", null)
    .not("conversation_id", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);
  const ids = (msgs ?? []).map((m: any) => m.id);
  if (ids.length === 0) return { tenantId, queued: 0, skipped: 0 };
  const [{ data: existing }, { data: analyzed }] = await Promise.all([
    admin.from("coaching_insights")
      .select("message_id").in("message_id", ids),
    admin.from("coaching_message_analysis")
      .select("message_id").in("message_id", ids).neq("status", "error"),
  ]);
  const seen = new Set([...(existing ?? []), ...(analyzed ?? [])].map((e: any) => e.message_id));
  const pending = (msgs ?? []).filter((m: any) => !seen.has(m.id));
  const totals = { inserted: 0, clean: 0, skipped: 0, errors: 0 };
  for (const m of pending) {
    const r = await analyzeOne(admin, m as any);
    totals.inserted += r.inserted ?? 0;
    totals.clean += r.clean ?? 0;
    totals.skipped += r.skipped ?? 0;
    totals.errors += r.errors ?? 0;
    await new Promise(rs => setTimeout(rs, 350));
  }
  console.log("tenant done", tenantId, totals);
  return { tenantId, queued: pending.length, skipped: ids.length - pending.length, totals };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const body = await req.json().catch(() => ({}));
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // === Modo CRON: chamado pelo pg_cron, identificado por body.cron === true
    const isCron = body?.cron === true;
    if (isCron) {
      const days = Math.min(Math.max(Number(body?.days ?? 2), 1), 30);
      const limit = Math.min(Math.max(Number(body?.limit ?? 80), 1), 300);
      const task = (async () => {
        const { data: tenants } = await admin.from("tenants").select("id");
        for (const t of (tenants ?? [])) {
          try { await runForTenant(admin, (t as any).id, days, limit); }
          catch (e) { console.error("tenant err", (t as any).id, e); }
        }
      })();
      // @ts-ignore
      if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(task);
      } else { task.catch((e) => console.error("cron err", e)); }
      return json({ mode: "cron", started: true });
    }

    // === Modo usuário (botão "Analisar últimos 30 dias")
    if (!authHeader.startsWith("Bearer ")) return json({ error: "missing auth" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "unauthenticated" }, 401);

    const days = Math.min(Math.max(Number(body?.days ?? 30), 1), 60);
    const limit = Math.min(Math.max(Number(body?.limit ?? 150), 1), 500);
    const force = body?.force === true;

    const { data: profile } = await admin.from("profiles")
      .select("tenant_id").eq("id", user.id).maybeSingle();
    const tenantId = profile?.tenant_id;
    if (!tenantId) return json({ error: "no tenant" }, 400);

    const { data: roles } = await admin.from("user_roles")
      .select("role").eq("user_id", user.id);
    const isPrivileged = (roles ?? []).some((r: any) =>
      ["owner", "supervisor", "superadmin"].includes(r.role));
    if (!isPrivileged) return json({ error: "forbidden" }, 403);

    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data: msgs, error: msgErr } = await admin.from("messages")
      .select("id, conversation_id")
      .eq("tenant_id", tenantId)
      .eq("direction", "outbound")
      .not("sent_by", "is", null)
      .not("conversation_id", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (msgErr) return json({ error: msgErr.message }, 500);

    const ids = (msgs ?? []).map((m: any) => m.id);
    if (ids.length === 0) return json({ queued: 0, skipped: 0, window_days: days, force });

    let pending = msgs ?? [];
    let skippedCount = 0;

    if (force) {
      // Limpa marcações e insights não-resolvidos para reanalisar com IA atualizada.
      // Mantém insights já resolvidos (tratados pelo gestor) para não perder histórico.
      await admin.from("coaching_message_analysis").delete().in("message_id", ids);
      await admin.from("coaching_insights").delete().in("message_id", ids).is("resolved_at", null);
    } else {
      const [{ data: existing }, { data: analyzed }] = await Promise.all([
        admin.from("coaching_insights")
          .select("message_id").in("message_id", ids),
        admin.from("coaching_message_analysis")
          .select("message_id").in("message_id", ids).neq("status", "error"),
      ]);
      const seen = new Set([...(existing ?? []), ...(analyzed ?? [])].map((e: any) => e.message_id));
      pending = (msgs ?? []).filter((m: any) => !seen.has(m.id));
      skippedCount = ids.length - pending.length;
    }

    const task = (async () => {
      const totals = { inserted: 0, clean: 0, skipped: 0, errors: 0 };
      for (const m of pending) {
        const r = await analyzeOne(admin, m as any);
        totals.inserted += r.inserted ?? 0;
        totals.clean += r.clean ?? 0;
        totals.skipped += r.skipped ?? 0;
        totals.errors += r.errors ?? 0;
        await new Promise(rs => setTimeout(rs, 400));
      }
      console.log("backfill done", { ...totals, force });
    })();
    // @ts-ignore
    if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(task);
    } else { task.catch((e) => console.error("worker err", e)); }

    return json({ queued: pending.length, skipped: skippedCount, window_days: days, force });
  } catch (e) {
    console.error("backfill err", e);
    return json({ error: String(e) }, 500);
  }
});

