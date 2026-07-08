// Sends the AI welcome message to a single lead. Idempotent per lead.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Número oficial da empresa (fallback caso o consultor responsável não tenha
// instância conectada). A regra principal é enviar pela instância do PRÓPRIO
// consultor responsável pelo lead — assim a conversa nasce já no WhatsApp dele.
const COMPANY_PHONE_DIGITS = "4792352804";

// Exceção determinada pela operação: Renata recebe boas-vindas pelo número 804
// enquanto o WhatsApp dela estiver com problema/desconectado.
const MANUAL_DELIVERY_USER_IDS = new Set<string>([
  "a452f69e-c5bb-4012-ae5f-b16eddb05051", // Renata Sobral
]);

// Consultores que pediram para NÃO enviar a mensagem automática de boas-vindas
// no pré-atendimento. Continuam recebendo o aviso do 804 e a notificação
// interna do sistema — apenas o disparo automático de WhatsApp é suprimido.
const SKIP_WELCOME_MEMBER_IDS = new Set<string>([
  "50544b35-6591-4eb7-88f7-e38737a608ee", // David
  "29fc52f9-c95c-4695-aea3-e2363e2b3cc7", // Micaelly
]);
const SKIP_WELCOME_USER_IDS = new Set<string>([
  "82e0fa88-3a4a-4766-be5f-7c4ed23e5cd7", // David
  "39e2f46f-3990-4cbf-89f9-9a49499c92f3", // Micaelly
]);

async function pickConsultantInstance(admin: any, tenantId: string, assignedMemberId: string | null) {
  if (!assignedMemberId) return null;
  const { data: member } = await admin
    .from("tenant_members")
    .select("user_id")
    .eq("id", assignedMemberId)
    .maybeSingle();
  const userId = member?.user_id;
  if (!userId) return null;
  const { data: inst } = await admin
    .from("whatsapp_instances")
    .select("id,server_url,instance_token,phone_number,is_connected,status,updated_at")
    .eq("tenant_id", tenantId)
    .eq("seller_user_id", userId)
    .or("is_connected.eq.true,status.eq.connected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (inst?.server_url && inst?.instance_token) return inst;
  return null;
}

async function pickCompanyInstance(admin: any, tenantId: string) {
  const { data: principal } = await admin
    .from("whatsapp_instances")
    .select("id,server_url,instance_token,phone_number,is_connected,status,updated_at")
    .eq("tenant_id", tenantId)
    .or("is_connected.eq.true,status.eq.connected")
    .ilike("phone_number", `%${COMPANY_PHONE_DIGITS}%`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (principal?.server_url && principal?.instance_token) return principal;
  // Fallback (apenas se o número principal estiver fora do ar)
  const { data: any_ } = await admin
    .from("whatsapp_instances")
    .select("id,server_url,instance_token,phone_number,is_connected,status,updated_at")
    .eq("tenant_id", tenantId)
    .or("is_connected.eq.true,status.eq.connected")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return any_;
}


// === Delay humano leve antes de cada envio (modo normal pós-manutenção).
async function randomSendDelay(): Promise<void> {
  // Modo normal: pequeno jitter humano (1.5s–4s) para não parecer robô,
  // sem os longos delays do modo manutenção.
  let ms = 1500 + Math.floor(Math.random() * 2500);
  if (Math.random() < 0.05) ms += 3000 + Math.floor(Math.random() * 7000);
  await new Promise((r) => setTimeout(r, ms));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function parseProviderResponse(resp: Response) {
  const raw = await resp.text();
  let data: any = {};
  try { data = JSON.parse(raw); } catch { data = { raw }; }
  return { raw, data };
}

function providerMessageId(data: any): string | null {
  const found =
    data?.id ?? data?.messageId ?? data?.messageid ?? data?.key?.id ??
    data?.data?.id ?? data?.data?.messageId ?? data?.data?.messageid ?? data?.data?.key?.id ??
    data?.response?.id ?? data?.response?.messageId ?? data?.response?.messageid ?? data?.response?.key?.id ??
    data?.message?.id ?? data?.message?.messageId ?? data?.message?.messageid ?? data?.message?.key?.id ??
    (Array.isArray(data?.messages) ? data.messages[0]?.key?.id ?? data.messages[0]?.id : null);
  return found ? String(found).trim() : null;
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
      // 1) Já existe mensagem confirmada no provedor? pula.
      //    (evita repetir abordagem quando a instância caiu e voltou — continuar de onde parou).
      const { data: anyMsg } = await admin
        .from("messages")
        .select("id")
        .eq("lead_id", lead_id)
        .eq("direction", "outbound")
        .not("external_id", "is", null)
        .in("status", ["sent", "delivered", "read"])
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

    // Regra padrão: enviar pela instância do CONSULTOR responsável. Exceção
    // explícita da operação: Renata pode enviar pelo 804 enquanto estiver offline.
    const consultantInstance = await pickConsultantInstance(admin, lead.tenant_id, lead.assigned_member_id);
    let principal = consultantInstance;
    if (!principal?.server_url || !principal?.instance_token) {
      const { data: assignedMember } = await admin
        .from("tenant_members")
        .select("user_id")
        .eq("id", lead.assigned_member_id)
        .maybeSingle();

      if (assignedMember?.user_id && MANUAL_DELIVERY_USER_IDS.has(assignedMember.user_id)) {
        principal = await pickCompanyInstance(admin, lead.tenant_id);
      }

      if (!principal?.server_url || !principal?.instance_token) {
        return json({ ok: true, skipped: "consultant whatsapp instance not connected" });
      }
    }
    console.log("[welcome] sending via instance", principal.id, "phone", principal.phone_number);


    const { data: tenant } = await admin
      .from("tenants").select("name").eq("id", lead.tenant_id).maybeSingle();
    const company = tenant?.name || "nossa equipe";

    // Busca o consultor responsável (atribuído na rotação) para apresentá-lo já
    // na primeira abordagem.
    let consultantFirstName: string | null = null;
    if (lead.assigned_member_id) {
      const { data: member } = await admin
        .from("tenant_members")
        .select("display_name")
        .eq("id", lead.assigned_member_id)
        .maybeSingle();
      const full = (member?.display_name || "").trim();
      if (full) consultantFirstName = full.split(/\s+/)[0];
    }

    const firstName = (lead.name || "").trim().split(/\s+/)[0] || "tudo bem";
    const consultantLine = consultantFirstName
      ? `Seu atendimento será conduzido pelo(a) consultor(a) *${consultantFirstName}*, que vai cuidar de tudo com você. `
      : "";
    const interestLine = lead.interest
      ? `Vi aqui que você tem interesse em *${lead.interest}* — me confirma se está correto? `
      : "";
    const text =
      `Olá, ${firstName}! 👋 Aqui é o atendimento da *Embracon*. ` +
      `Você entrou em contato conosco e queremos te ajudar a realizar o seu sonho🏡🚗\n\n` +
      consultantLine +
      interestLine +
      `Posso te enviar agora as opções de carta e parcela que mais se encaixam no seu perfil?`;

    const phoneDigits = String(lead.phone).replace(/\D/g, "");
    await randomSendDelay();

    const r = await fetch(`${principal.server_url.replace(/\/$/, "")}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: principal.instance_token },
      body: JSON.stringify({ number: phoneDigits, text, message: text }),
    });
    const { raw, data } = await parseProviderResponse(r);
    const providerId = providerMessageId(data);
    if (!r.ok || !providerId) {
      const detail = (!providerId && r.ok ? `provider accepted without message id: ${raw}` : raw).slice(0, 300);
      console.error("welcome send failed", r.status, "instance", principal.id, detail);
      if (r.status === 503 && /not reconnectable|disconnected/i.test(detail)) {
        await admin.from("whatsapp_instances")
          .update({ is_connected: false, status: "disconnected", updated_at: new Date().toISOString() })
          .eq("id", principal.id);
      }
      return json({ error: `provider ${r.status}`, detail }, 502);
    }
    const instance = principal;


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
          external_id: providerId,
        metadata: { ai: true, welcome: true, source: "backfill" },
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
