// Sends the AI welcome message to a single lead. Idempotent per lead.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// === MODO ESTABILIDADE: delay aleatório antes de cada envio (remover quando voltar ao normal).
async function randomSendDelay(): Promise<void> {
  let ms = 5000 + Math.floor(Math.random() * 55000);
  if (Math.random() < 0.1) ms += 30000 + Math.floor(Math.random() * 60000);
  console.log("[stability] sleeping", ms, "ms before send");
  await new Promise((r) => setTimeout(r, ms));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { lead_id, force } = await req.json().catch(() => ({}));
    if (!lead_id) return json({ error: "lead_id required" }, 400);

    const { data: lead } = await admin.from("leads").select("*").eq("id", lead_id).maybeSingle();
    if (!lead) return json({ error: "lead not found" }, 404);
    if (!lead.phone) return json({ ok: true, skipped: "no phone" });

    if (!force) {
      // 1) Já enviamos welcome antes? pula.
      const { data: already } = await admin
        .from("lead_notifications")
        .select("id")
        .eq("lead_id", lead_id)
        .eq("type", "welcome")
        .eq("delivered", true)
        .limit(1);
      if (already && already.length) return json({ ok: true, skipped: "already welcomed" });

      // 2) Já existe QUALQUER mensagem trocada com esse lead? pula
      //    (evita repetir abordagem quando a instância caiu e voltou — continuar de onde parou).
      const { data: anyMsg } = await admin
        .from("messages")
        .select("id")
        .eq("lead_id", lead_id)
        .limit(1);
      if (anyMsg && anyMsg.length) {
        // Marca como welcomed para a fila não tentar de novo no futuro.
        await admin.from("lead_notifications").insert({
          tenant_id: lead.tenant_id,
          lead_id: lead.id,
          type: "welcome",
          recipient_phone: String(lead.phone || "").replace(/\D/g, "") || null,
          message_sent: "[skipped: conversation already in progress]",
          delivered: true,
        });
        return json({ ok: true, skipped: "conversation already in progress" });
      }

      // 3) NÃO usar "existe conversa" como guarda — `notify-consultant-by-tier`
      //    pré-cria uma conversa vazia assim que o lead entra, e isso fazia o
      //    welcome ser silenciosamente pulado. O guard 2 (qualquer mensagem)
      //    já cobre o caso real de "atendimento já em andamento".
    }

    // Pega TODAS as instâncias marcadas como conectadas (mais recente primeiro)
    // e tenta enviar até alguma funcionar. Se o provedor responder 503
    // "session is not reconnectable", marca a instância como desconectada.
    const { data: instances } = await admin
      .from("whatsapp_instances")
      .select("id,server_url,instance_token,updated_at")
      .eq("tenant_id", lead.tenant_id)
      .or("is_connected.eq.true,status.eq.connected")
      .order("updated_at", { ascending: false });
    const candidates = (instances ?? []).filter((i: any) => i.server_url && i.instance_token);
    if (!candidates.length) {
      return json({ error: "no connected whatsapp instance" }, 400);
    }

    const { data: tenant } = await admin
      .from("tenants").select("name").eq("id", lead.tenant_id).maybeSingle();
    const company = tenant?.name || "nossa equipe";

    const firstName = (lead.name || "").trim().split(/\s+/)[0] || "tudo bem";
    const interestLine = lead.interest
      ? `Vi aqui que você tem interesse em *${lead.interest}* — me confirma se está correto? `
      : "";
    const text =
      `Olá, ${firstName}! 👋 Aqui é o atendimento da *${company} Consórcios*. ` +
      `Recebemos seu contato e queremos te ajudar a realizar esse sonho. 🏡🚗\n\n` +
      interestLine +
      `Posso te enviar agora as opções de carta e parcela que mais se encaixam no seu perfil?`;

    const phoneDigits = String(lead.phone).replace(/\D/g, "");
    await randomSendDelay();

    let instance: any = null;
    let lastErr = "";
    let lastStatus = 0;
    for (const cand of candidates) {
      const r = await fetch(`${cand.server_url.replace(/\/$/, "")}/send/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: cand.instance_token },
        body: JSON.stringify({ number: phoneDigits, text, message: text }),
      });
      if (r.ok) { instance = cand; break; }
      lastStatus = r.status;
      lastErr = (await r.text()).slice(0, 300);
      console.error("welcome send failed", r.status, "instance", cand.id, lastErr);
      // Sessão morta no provedor → marca desconectada e tenta a próxima.
      if (r.status === 503 && /not reconnectable|disconnected/i.test(lastErr)) {
        await admin.from("whatsapp_instances")
          .update({ is_connected: false, status: "disconnected", updated_at: new Date().toISOString() })
          .eq("id", cand.id);
        continue;
      }
      break;
    }
    if (!instance) {
      return json({ error: `provider ${lastStatus}`, detail: lastErr }, 502);
    }

    await admin.from("leads").update({
      whatsapp_instance_id: instance.id,
      last_message_at: new Date().toISOString(),
    }).eq("id", lead.id);

    const { data: convExisting } = await admin
      .from("conversations").select("id")
      .eq("tenant_id", lead.tenant_id).eq("lead_id", lead.id).limit(1).maybeSingle();
    let convId = convExisting?.id as string | undefined;
    if (!convId) {
      const { data: newConv } = await admin.from("conversations").insert({
        tenant_id: lead.tenant_id,
        lead_id: lead.id,
        whatsapp_instance_id: instance.id,
        channel: "whatsapp",
        status: "open",
        last_message_at: new Date().toISOString(),
        last_message_preview: text.slice(0, 120),
      }).select("id").maybeSingle();
      convId = newConv?.id;
    } else {
      await admin.from("conversations").update({
        last_message_at: new Date().toISOString(),
        last_message_preview: text.slice(0, 120),
      }).eq("id", convId);
    }

    if (convId) {
      await admin.from("messages").insert({
        tenant_id: lead.tenant_id,
        conversation_id: convId,
        lead_id: lead.id,
        whatsapp_instance_id: instance.id,
        direction: "outbound",
        body: text,
        content: text,
        status: "sent",
        metadata: { welcome: true, source: "backfill" },
      });
    }

    await admin.from("lead_notifications").insert({
      tenant_id: lead.tenant_id,
      lead_id: lead.id,
      type: "welcome",
      recipient_phone: phoneDigits,
      message_sent: text,
      delivered: true,
    });

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
