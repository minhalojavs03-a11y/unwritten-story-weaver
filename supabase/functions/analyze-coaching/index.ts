// Analisa cada mensagem outbound humana e gera insights de coaching:
// 1) Sinal de compra ignorado pelo consultor
// 2) Mensagem longa que deveria ter sido áudio
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function callAI(systemPrompt: string, userPrompt: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
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
      await new Promise(rs => setTimeout(rs, 8000 * (attempt + 1)));
      continue;
    }
    if (!r.ok) {
      console.error("AI err", r.status, await r.text());
      return null;
    }
    const d = await r.json();
    const content = d?.choices?.[0]?.message?.content ?? "";
    try { return JSON.parse(content); } catch { console.error("AI bad json", content); return null; }
  }
  return null;
}

function shouldBeAudio(text: string): { flag: boolean; reason: string } {
  if (!text) return { flag: false, reason: "" };
  const len = text.length;
  if (len < 320) return { flag: false, reason: "" };
  const lower = text.toLowerCase();
  const hits = AUDIO_KEYWORDS.filter(k => lower.includes(k));
  // Texto longo (>320) com termos técnicos = devia ser áudio
  if (hits.length >= 1) {
    return {
      flag: true,
      reason: `Mensagem com ${len} caracteres explicando ${hits.slice(0, 3).join(", ")}. Áudio teria mais conexão e converteria melhor que esse "muralhão" de texto.`,
    };
  }
  // Texto muito longo (>500) mesmo sem keywords técnicas
  if (len >= 500) {
    return {
      flag: true,
      reason: `Resposta com ${len} caracteres. Texto longo cansa o cliente — áudio passa mais confiança e fecha mais rápido.`,
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { message_id, conversation_id } = await req.json();
    if (!message_id || !conversation_id) return json({ error: "missing ids" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Dedupe — não reanalisa mensagens já processadas
    const [{ data: already }, { data: alreadyClean }] = await Promise.all([
      admin.from("coaching_insights")
        .select("id").eq("message_id", message_id).limit(1).maybeSingle(),
      admin.from("coaching_message_analysis")
        .select("id").eq("message_id", message_id).neq("status", "error").limit(1).maybeSingle(),
    ]);
    if (already || alreadyClean) return json({ skipped: "already_analyzed" });

    // Mensagem do consultor (CRM ou WhatsApp nativo "fromMe")
    const { data: msg } = await admin.from("messages")
      .select("id, tenant_id, conversation_id, lead_id, body, content, direction, sent_by, created_at, message_type, metadata")
      .eq("id", message_id).maybeSingle();
    const isAi = !!(msg?.metadata && (msg.metadata as any).ai === true);
    if (!msg || msg.direction !== "outbound" || isAi) {
      if (msg) await markAnalyzed(admin, msg, { skipped: 1 });
      return json({ skipped: "not_human_outbound" });
    }

    const text = (msg.body ?? msg.content ?? "").trim();
    if (!text) {
      await markAnalyzed(admin, msg, { skipped: 1 });
      return json({ skipped: "empty" });
    }

    // Lead e consultor — exige lead atribuído para conseguir atribuir o insight a alguém
    const { data: lead } = await admin.from("leads")
      .select("id, name, assigned_member_id, stage, credit_value")
      .eq("id", msg.lead_id ?? "").maybeSingle();
    const memberId = lead?.assigned_member_id ?? msg.sent_by;
    if (!memberId) {
      await markAnalyzed(admin, msg, { skipped: 1 });
      return json({ skipped: "no_member" });
    }

    // Última mensagem inbound antes desta
    const { data: prevInbound } = await admin.from("messages")
      .select("id, body, content, created_at")
      .eq("conversation_id", conversation_id)
      .eq("direction", "inbound")
      .lt("created_at", msg.created_at)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    // Histórico recente para contexto
    const { data: history } = await admin.from("messages")
      .select("direction, body, content, created_at, sent_by")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false }).limit(10);
    const ordered = (history ?? []).reverse();

    const inserts: any[] = [];

    // === 1) HEURÍSTICA — Devia ser áudio?
    if ((msg.message_type ?? "text") === "text") {
      const audio = shouldBeAudio(text);
      if (audio.flag) {
        inserts.push({
          tenant_id: msg.tenant_id,
          conversation_id,
          lead_id: msg.lead_id,
          member_id: memberId,
          message_id: msg.id,
          insight_type: "should_be_audio",
          severity: text.length > 600 ? "high" : "medium",
          title: "Deveria ter mandado áudio",
          detail: audio.reason,
          consultant_quote: text.slice(0, 400),
          suggestion: "Para explicações técnicas de consórcio (contemplação, lance, parcela, reajuste), grave um áudio de 30-60s. Texto longo cansa e parece menos confiante.",
          metadata: { char_count: text.length },
        });
      }
    }

    // === 2) IA — Sinal de compra perdido?
    if (prevInbound) {
      const inboundText = (prevInbound.body ?? prevInbound.content ?? "").trim();
      if (inboundText.length > 3 && hasBuyingSignalCandidate(inboundText)) {
        const histStr = ordered.map(m => `${m.direction === "inbound" ? "CLIENTE" : "CONSULTOR"}: ${(m.body ?? m.content ?? "").slice(0, 300)}`).join("\n");
        const sys = `Você é um analista sênior de vendas de consórcio. Avalie se o CLIENTE deu um SINAL DE COMPRA CLARO na última mensagem dele e se o CONSULTOR aproveitou ou enrolou. Sinais de compra incluem: perguntar preço/parcela/entrada, perguntar como começar/contratar, falar em prazo/quando, comparar com financiamento, perguntar próximos passos, demonstrar urgência, pedir simulação concreta.

Responda APENAS em JSON com:
{
  "is_buying_signal": boolean,
  "signal_quote": "trecho exato do cliente (máx 180 chars)",
  "signal_strength": "high"|"medium"|"low",
  "consultant_addressed": boolean,
  "what_went_wrong": "1 frase: o que o consultor errou (vazio se acertou)",
  "suggestion": "1-2 frases: o que ele deveria ter respondido para avançar a venda"
}

Seja EXIGENTE: só marque is_buying_signal=true se for sinal CLARO. Se o consultor respondeu bem (avançou pra fechamento, agendou, ofereceu simulação concreta), consultant_addressed=true.`;

        const user = `HISTÓRICO RECENTE:
${histStr}

ÚLTIMA MENSAGEM DO CLIENTE:
"${inboundText}"

RESPOSTA DO CONSULTOR (em análise):
"${text}"

Avalie.`;

        const ai = await callAI(sys, user);
        if (ai && ai.is_buying_signal && ai.consultant_addressed === false) {
          inserts.push({
            tenant_id: msg.tenant_id,
            conversation_id,
            lead_id: msg.lead_id,
            member_id: memberId,
            message_id: msg.id,
            insight_type: "missed_buying_signal",
            severity: ai.signal_strength === "high" ? "high" : "medium",
            title: "Sinal de compra não aproveitado",
            detail: ai.what_went_wrong || "O cliente sinalizou intenção de avançar e a resposta não conduziu ao fechamento.",
            signal_quote: ai.signal_quote ?? inboundText.slice(0, 180),
            consultant_quote: text.slice(0, 400),
            suggestion: ai.suggestion ?? "Responda diretamente o que o cliente perguntou e conduza ao próximo passo (simulação, agendamento ou fechamento).",
            metadata: { signal_strength: ai.signal_strength ?? "medium" },
          });
        }
      }
    }

    if (inserts.length) {
      const { error } = await admin.from("coaching_insights").insert(inserts);
      if (error) {
        console.error("insert err", error);
        await markAnalyzed(admin, msg, { errors: 1 }, error.message);
        return json({ inserted: 0, error: error.message }, 500);
      }
    }

    await markAnalyzed(admin, msg, inserts.length ? { inserted: inserts.length } : { clean: 1 });

    return json({ inserted: inserts.length });
  } catch (e) {
    console.error("analyze-coaching err", e);
    return json({ error: String(e) }, 500);
  }
});
