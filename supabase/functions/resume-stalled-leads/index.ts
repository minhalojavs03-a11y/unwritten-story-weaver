// Reativa a IA de pré-atendimento para leads onde a última mensagem é do cliente
// (inbound) e nenhum humano respondeu — gera UMA resposta nova via IA e envia.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Único número autorizado a ENVIAR mensagens em nome da empresa (47 9235-2804).
const COMPANY_PHONE_DIGITS = "4792352804";

async function pickCompanyInstance(admin: any, tenantId: string) {
  const { data: principal } = await admin
    .from("whatsapp_instances")
    .select("id,server_url,instance_token,phone_number,is_connected,status")
    .eq("tenant_id", tenantId)
    .or("is_connected.eq.true,status.eq.connected")
    .ilike("phone_number", `%${COMPANY_PHONE_DIGITS}%`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (principal?.server_url && principal?.instance_token) return principal;
  const { data: any_ } = await admin
    .from("whatsapp_instances")
    .select("id,server_url,instance_token,phone_number,is_connected,status")
    .eq("tenant_id", tenantId)
    .or("is_connected.eq.true,status.eq.connected")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return any_;
}

function ok(b: unknown = { ok: true }, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function callAI(systemPrompt: string, history: { role: "user" | "assistant"; content: string }[], userText: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: userText }],
      }),
    });
    if (r.status === 429) {
      const wait = 15000 + attempt * 15000;
      console.log(`AI 429, waiting ${wait}ms (attempt ${attempt + 1})`);
      await new Promise(rs => setTimeout(rs, wait));
      continue;
    }
    if (!r.ok) { console.error("AI err", r.status, await r.text()); return ""; }
    const d = await r.json();
    return d?.choices?.[0]?.message?.content ?? "";
  }
  console.error("AI err: exhausted retries on 429");
  return "";
}

async function buildPrompt(admin: any, tenantId: string, tenantName: string | undefined, aiCfg: any): Promise<string> {
  const parts: string[] = [];
  const name = tenantName ?? "nossa administradora de consórcios";
  parts.push(`Você é o assistente virtual de pré-atendimento da ${name} no WhatsApp. Sua função é qualificar o lead até que O CONSULTOR RESPONSÁVEL (humano, já designado) assuma a conversa. Tom: ${aiCfg?.tone ?? "amigavel"}.

REGRAS:
- Objetivo, como pessoa real no WhatsApp. Máx 2 frases curtas (~280 chars). UMA pergunta por vez.
- Sem listas/markdown. Máx 1 emoji.
- Nunca invente valores/taxas/nomes. Se não souber, diga em 1 frase que o consultor assume em instantes.
- Sempre "o consultor" (já designado). Nunca prometa "vou verificar/retornar".

CONTEXTO: o cliente mandou uma mensagem e ficou sem resposta. Retome a conversa com naturalidade — sem se desculpar pela demora, sem dizer "voltei" — apenas dê sequência ao pré-atendimento respondendo o que ele perguntou ou fazendo a próxima pergunta de qualificação.`);

  if (aiCfg?.business_description) parts.push(`SOBRE:\n${aiCfg.business_description}`);
  const c: string[] = [];
  if (aiCfg?.address) c.push(`Endereço: ${aiCfg.address}`);
  if (aiCfg?.phone) c.push(`Telefone: ${aiCfg.phone}`);
  if (aiCfg?.whatsapp) c.push(`WhatsApp: ${aiCfg.whatsapp}`);
  if (aiCfg?.website) c.push(`Site: ${aiCfg.website}`);
  if (c.length) parts.push(`CONTATO:\n${c.join("\n")}`);
  if (aiCfg?.services) parts.push(`SEGMENTOS:\n${aiCfg.services}`);
  if (aiCfg?.insurance_plans) parts.push(`PARCEIROS:\n${aiCfg.insurance_plans}`);
  if (aiCfg?.payment_methods) parts.push(`PAGAMENTO:\n${aiCfg.payment_methods}`);
  if (aiCfg?.differentials) parts.push(`DIFERENCIAIS:\n${aiCfg.differentials}`);
  if (aiCfg?.extra_notes) parts.push(`OBS:\n${aiCfg.extra_notes}`);

  const { data: hours } = await admin.from("business_hours").select("*").eq("tenant_id", tenantId).order("weekday");
  if (hours?.length) {
    parts.push(`HORÁRIO:\n${hours.map((h: any) => `${WEEKDAYS[h.weekday]}: ${h.is_closed ? "Fechado" : `${h.open_time ?? "-"} às ${h.close_time ?? "-"}`}`).join("\n")}`);
  }
  const { data: faqs } = await admin.from("faqs").select("question,answer").eq("tenant_id", tenantId).order("position");
  if (faqs?.length) parts.push(`FAQ:\n${faqs.map((f: any) => `P: ${f.question}\nR: ${f.answer}`).join("\n\n")}`);
  if (aiCfg?.system_prompt) parts.push(`EXTRA:\n${aiCfg.system_prompt}`);
  return parts.join("\n\n");
}

// Delay aleatório para envios automáticos (anti-ban WhatsApp).
async function randomSendDelay(): Promise<void> {
  const ms = 8000 + Math.floor(Math.random() * 22000); // 8-30s
  console.log("[anti-ban] sleeping", ms, "ms before automated send");
  await new Promise((r) => setTimeout(r, ms));
}

async function sendText(serverUrl: string, token: string, phone: string, text: string): Promise<string | null> {
  try {
    await randomSendDelay();
    const r = await fetch(`${serverUrl}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ number: phone, text, message: text }),
    });
    const raw = await r.text().catch(() => "");
    let d: any = null; try { d = raw ? JSON.parse(raw) : null; } catch {}
    return d?.id ?? d?.messageId ?? d?.key?.id ?? null;
  } catch (e) { console.error("send fail", e); return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry") === "1";
    const minStaleMin = Number(url.searchParams.get("min_minutes") ?? "10");
    const maxAgeDays = Number(url.searchParams.get("max_days") ?? "7");
    const limit = Number(url.searchParams.get("limit") ?? "100");

    const since = new Date(Date.now() - maxAgeDays * 86400000).toISOString();
    const upto = new Date(Date.now() - minStaleMin * 60000).toISOString();

    // Get recent inbound messages first, then filter
    const { data: inboundMsgs } = await admin
      .from("messages")
      .select("lead_id, conversation_id, tenant_id, whatsapp_instance_id, body, created_at")
      .eq("direction", "inbound")
      .gte("created_at", since)
      .lte("created_at", upto)
      .not("lead_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);

    const seen = new Set<string>();
    const candidates: any[] = [];
    for (const m of inboundMsgs ?? []) {
      if (seen.has(m.lead_id)) continue;
      seen.add(m.lead_id);
      // Verify this is the truly last message (no newer outbound exists)
      const { data: newer } = await admin
        .from("messages")
        .select("id, direction, sent_by")
        .eq("lead_id", m.lead_id)
        .gt("created_at", m.created_at)
        .limit(1);
      if (newer && newer.length) continue;
      // Ensure no human has ever replied in this conversation
      const { data: human } = await admin
        .from("messages")
        .select("id")
        .eq("conversation_id", m.conversation_id)
        .eq("direction", "outbound")
        .not("sent_by", "is", null)
        .limit(1);
      if (human && human.length) continue;
      candidates.push(m);
      if (candidates.length >= limit) break;
    }

    if (dryRun) return ok({ would_process: candidates.length, leads: candidates.map(c => c.lead_id) });

    const runner = async () => {
      let sent = 0, skipped = 0, errors = 0;
      for (const m of candidates) {
        try {
          const { data: lead } = await admin.from("leads").select("id, name, phone").eq("id", m.lead_id).maybeSingle();
          if (!lead?.phone) { skipped++; console.log("skip no_phone", m.lead_id); continue; }
          const { data: instance } = await admin.from("whatsapp_instances").select("*").eq("id", m.whatsapp_instance_id).maybeSingle();
          if (!instance?.server_url || !instance?.instance_token) { skipped++; continue; }
          const { data: aiCfg } = await admin.from("ai_config").select("*").eq("tenant_id", m.tenant_id).maybeSingle();
          if (aiCfg && aiCfg.enabled === false) { skipped++; continue; }
          const { data: tenant } = await admin.from("tenants").select("name").eq("id", m.tenant_id).maybeSingle();
          const { data: recent } = await admin
            .from("messages").select("direction, body, created_at")
            .eq("conversation_id", m.conversation_id).order("created_at", { ascending: false }).limit(11);
          const history = (recent ?? []).reverse().slice(0, -1)
            .map((mm: any) => ({ role: mm.direction === "inbound" ? "user" as const : "assistant" as const, content: mm.body ?? "" }))
            .filter((mm: any) => mm.content);
          const prompt = await buildPrompt(admin, m.tenant_id, tenant?.name, aiCfg);
          const reply = await callAI(prompt, history, m.body ?? "(o cliente mandou uma mensagem)");
          if (!reply.trim()) { skipped++; console.log("skip empty_ai", m.lead_id); continue; }
          const phone = lead.phone.replace(/[^0-9]/g, "");
          const providerId = await sendText(instance.server_url, instance.instance_token, phone, reply);
          await admin.from("messages").insert({
            tenant_id: m.tenant_id, conversation_id: m.conversation_id, lead_id: m.lead_id,
            whatsapp_instance_id: instance.id, direction: "outbound", body: reply, external_id: providerId,
          });
          sent++;
          console.log(`[resume] sent to ${lead.name ?? phone}: ${reply.slice(0, 60)}`);
          await new Promise(r => setTimeout(r, 3000));
        } catch (e) {
          errors++;
          console.error("resume err", m.lead_id, e);
        }
      }
      console.log(`[resume] DONE sent=${sent} skipped=${skipped} errors=${errors}`);
    };

    // @ts-ignore - EdgeRuntime is available at runtime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(runner());
    } else {
      runner();
    }
    return ok({ started: true, queued: candidates.length });
  } catch (e) {
    console.error(e);
    return ok({ error: String(e) }, 500);
  }
});
