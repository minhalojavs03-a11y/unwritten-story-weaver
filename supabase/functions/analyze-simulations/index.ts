// Identifica imagens/PDFs enviados pelo consultor que são SIMULAÇÕES
// (carta de crédito, parcela, planilha de consórcio etc.) usando IA de visão.
// Quando confirma, marca a mensagem, premia o consultor e cria um insight.
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

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Aceita imagem (jpg/png/webp) e PDF. Áudio/vídeo são ignorados.
function isCandidateMedia(m: any): boolean {
  if (!m?.media_url) return false;
  const type = (m.message_type ?? "").toLowerCase();
  if (type === "audio" || type === "video" || type === "sticker") return false;
  const url = m.media_url.toLowerCase();
  if (url.match(/\.(jpe?g|png|webp|gif|pdf)(\?|$)/)) return true;
  return type === "image" || type === "document" || type === "file";
}

async function callVisionAI(mediaUrl: string, caption: string, isPdf: boolean) {
  const systemPrompt = `Você é um auditor de atendimento de uma empresa de consórcio/crédito.
O consultor enviou uma mídia para o cliente. Sua tarefa: identificar se essa mídia é uma SIMULAÇÃO comercial.

Conta como SIMULAÇÃO:
- Carta de crédito, planilha de parcelas, tabela de consórcio
- Print de sistema mostrando valores/parcelas/taxa
- Proposta com valor de crédito, prazo, parcela, lance
- PDF de simulação/proposta da empresa

NÃO conta como simulação:
- Foto pessoal, meme, sticker
- Foto de produto sem valores
- Print de conversa do WhatsApp
- Documento pessoal do cliente (RG, comprovante)
- Imagem genérica de marketing sem números

Responda APENAS JSON: { "is_simulation": boolean, "confidence": "low"|"medium"|"high", "kind": "carta_credito"|"tabela_parcelas"|"proposta"|"print_sistema"|"outro"|null, "summary": "uma frase curta do que viu" }`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Legenda enviada pelo consultor: "${caption || "(sem legenda)"}"\n\nAnalise a mídia anexa${isPdf ? " (PDF)" : ""} e responda em JSON.`,
                },
                { type: "image_url", image_url: { url: mediaUrl } },
              ],
            },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (r.status === 429) {
        await new Promise((rs) => setTimeout(rs, 8000 * (attempt + 1)));
        continue;
      }
      if (!r.ok) {
        console.error("vision err", r.status, await r.text().catch(() => ""));
        return null;
      }
      const d = await r.json();
      const content = d?.choices?.[0]?.message?.content ?? "";
      try {
        return JSON.parse(content);
      } catch {
        console.error("vision bad json", content);
        return null;
      }
    } catch (e) {
      console.error("vision throw", e);
      return null;
    }
  }
  return null;
}

async function processMessage(admin: any, msg: any, cfgByTenant: Map<string, any>) {
  // Já analisada?
  const meta = msg.metadata ?? {};
  if (meta.simulation_analyzed) return { skipped: true };

  const ai = await callVisionAI(msg.media_url, msg.body ?? msg.content ?? "", /\.pdf(\?|$)/i.test(msg.media_url));
  const result = ai ?? { is_simulation: false, confidence: "low", kind: null, summary: "Falha ao analisar" };
  const isSim = !!result.is_simulation && result.confidence !== "low";

  // Marca a mensagem (sempre, pra não reprocessar)
  await admin.from("messages").update({
    metadata: {
      ...meta,
      simulation_analyzed: true,
      simulation: {
        is_simulation: isSim,
        confidence: result.confidence ?? "low",
        kind: result.kind ?? null,
        summary: result.summary ?? null,
        analyzed_at: new Date().toISOString(),
      },
    },
  }).eq("id", msg.id);

  if (!isSim) return { skipped: false, is_simulation: false };

  // Lookup consultor a partir da mensagem
  let memberId: string | null = null;
  if (msg.sent_by) {
    const { data: tm } = await admin
      .from("tenant_members")
      .select("id")
      .eq("tenant_id", msg.tenant_id)
      .eq("user_id", msg.sent_by)
      .maybeSingle();
    memberId = tm?.id ?? null;
  }
  if (!memberId && msg.lead_id) {
    const { data: lead } = await admin
      .from("leads")
      .select("assigned_member_id")
      .eq("id", msg.lead_id)
      .maybeSingle();
    memberId = lead?.assigned_member_id ?? null;
  }

  // Pontuação
  let cfg = cfgByTenant.get(msg.tenant_id);
  if (!cfg) {
    const { data } = await admin
      .from("gamification_config")
      .select("points_simulation_sent")
      .eq("tenant_id", msg.tenant_id)
      .maybeSingle();
    cfg = data ?? { points_simulation_sent: 30 };
    cfgByTenant.set(msg.tenant_id, cfg);
  }

  if (memberId) {
    await admin.from("gamification_events").insert({
      tenant_id: msg.tenant_id,
      member_id: memberId,
      event_type: "simulation_sent",
      points: cfg.points_simulation_sent ?? 30,
      lead_id: msg.lead_id,
      message_id: msg.id,
      metadata: { kind: result.kind, confidence: result.confidence, summary: result.summary },
    });
  }

  // Coaching insight informativo
  await admin.from("coaching_insights").insert({
    tenant_id: msg.tenant_id,
    conversation_id: msg.conversation_id,
    lead_id: msg.lead_id,
    member_id: memberId,
    message_id: msg.id,
    insight_type: "simulation_sent",
    severity: "low",
    title: "Simulação enviada",
    detail: result.summary ?? "Mídia identificada como simulação comercial",
    suggestion: "Acompanhe para fechar — cliente já recebeu números.",
    metadata: { kind: result.kind, confidence: result.confidence, media_url: msg.media_url },
  }).then(() => {}, (e: any) => console.error("insight err", e?.message));

  return { skipped: false, is_simulation: true, kind: result.kind };
}

async function runForTenant(admin: any, tenantId: string, days: number, limit: number) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data: msgs, error } = await admin
    .from("messages")
    .select("id,tenant_id,conversation_id,lead_id,sent_by,media_url,message_type,body,content,metadata,created_at")
    .eq("tenant_id", tenantId)
    .eq("direction", "outbound")
    .not("sent_by", "is", null)
    .not("media_url", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("query err", error);
    return { processed: 0, simulations: 0, skipped: 0 };
  }

  let processed = 0, simulations = 0, skipped = 0;
  const cfg = new Map<string, any>();
  for (const m of (msgs ?? []).filter(isCandidateMedia)) {
    const r = await processMessage(admin, m, cfg);
    if (r.skipped) skipped++;
    else {
      processed++;
      if (r.is_simulation) simulations++;
    }
    // throttle leve pra não saturar AI gateway
    await new Promise((rs) => setTimeout(rs, 500));
  }
  return { processed, simulations, skipped, candidates: msgs?.length ?? 0 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const isCron = body?.cron === true;
    const days = Math.min(Math.max(Number(body?.days ?? 2), 1), 30);
    const limit = Math.min(Math.max(Number(body?.limit ?? 40), 1), 200);

    if (isCron) {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
      // Roda em background
      const work = (async () => {
        const { data: tenants } = await admin.from("tenants").select("id").limit(200);
        const results: any[] = [];
        for (const t of tenants ?? []) {
          const r = await runForTenant(admin, t.id, days, limit);
          results.push({ tenant_id: t.id, ...r });
        }
        console.log("cron simulation done", JSON.stringify(results));
      })();
      // @ts-ignore EdgeRuntime
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
      else work.catch((e) => console.error("bg err", e));
      return json({ queued: true, mode: "cron" });
    }

    // User mode: usa JWT
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "missing auth" }, 401);
    const user = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await user.auth.getUser();
    if (!u?.user) return json({ error: "unauthenticated" }, 401);
    const { data: prof } = await user
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    if (!prof?.tenant_id) return json({ error: "no tenant" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const work = runForTenant(admin, prof.tenant_id, Math.min(days, 60), Math.min(limit, 200));
    // @ts-ignore
    if (typeof EdgeRuntime !== "undefined") {
      EdgeRuntime.waitUntil(work.then((r) => console.log("user sim", JSON.stringify(r))));
      return json({ queued: true });
    }
    const r = await work;
    return json({ ok: true, ...r });
  } catch (e: any) {
    console.error("fn err", e);
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
