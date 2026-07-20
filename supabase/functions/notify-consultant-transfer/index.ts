// Notifica o consultor NOVO quando um lead é transferido para ele.
// Regra: aviso vai pelo número da empresa (804), explicando que é transferência
// por demora no atendimento anterior. Orienta a NÃO reenviar boas-vindas e
// apenas se apresentar dando continuidade ao atendimento.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NOTIFIER_PHONE_DIGITS = "4792352804";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function pickNotifierInstance(admin: any, tenantId: string) {
  const { data: sup } = await admin
    .from("whatsapp_instances")
    .select("server_url,instance_token,status,is_connected,phone_number")
    .eq("tenant_id", tenantId)
    .or("is_connected.eq.true,status.eq.connected")
    .ilike("phone_number", `%${NOTIFIER_PHONE_DIGITS}%`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sup?.server_url && sup?.instance_token) return sup;
  const { data: any_ } = await admin
    .from("whatsapp_instances")
    .select("server_url,instance_token,status,is_connected,phone_number")
    .eq("tenant_id", tenantId)
    .or("is_connected.eq.true,status.eq.connected")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return any_;
}

function onlyDigits(s: string | null | undefined) {
  return String(s || "").replace(/\D/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { lead_id, from_member_id, to_member_id } = await req.json().catch(() => ({}));
    if (!lead_id || !to_member_id) return json({ error: "lead_id and to_member_id required" }, 400);
    if (from_member_id && from_member_id === to_member_id) {
      return json({ ok: true, skipped: "same member" });
    }

    const { data: lead } = await admin
      .from("leads")
      .select("id, tenant_id, name, phone")
      .eq("id", lead_id)
      .maybeSingle();
    if (!lead) return json({ error: "lead not found" }, 404);

    const { data: toMember } = await admin
      .from("tenant_members")
      .select("id, display_name, phone, user_id, notify_whatsapp, notify_inapp, email")
      .eq("id", to_member_id)
      .maybeSingle();
    if (!toMember) return json({ error: "target member not found" }, 404);

    let fromName = "outro consultor";
    if (from_member_id) {
      const { data: fromMember } = await admin
        .from("tenant_members")
        .select("display_name")
        .eq("id", from_member_id)
        .maybeSingle();
      const full = (fromMember?.display_name || "").trim();
      if (full) fromName = full.split(/\s+/)[0];
    }

    const toFirstName = (toMember.display_name || "").trim().split(/\s+/)[0] || "consultor(a)";
    const leadName = lead.name || "(sem nome)";
    const leadPhone = lead.phone || "(não informado)";

    const text = [
      `🔄 *Lead transferido para você*`,
      ``,
      `Olá, ${toFirstName}! Este lead foi transferido de *${fromName}* por demora no atendimento e agora está com você.`,
      ``,
      `👤 *Nome:* ${leadName}`,
      `📞 *Número:* ${leadPhone}`,
      ``,
      `⚠️ *Importante:*`,
      `• *NÃO envie mensagem de boas-vindas* — o lead já foi abordado anteriormente.`,
      `• Apenas *se apresente pelo nome* e informe que vai *dar continuidade ao atendimento*.`,
      `• Exemplo: "Olá ${(leadName.split(/\s+/)[0]) || ""}! Aqui é o(a) ${toFirstName}, vou dar continuidade ao seu atendimento a partir de agora 🙂"`,
      ``,
      `Acesse o sistema para ver o histórico da conversa.`,
    ].join("\n");

    // In-app
    try {
      if (toMember.notify_inapp !== false && toMember.email) {
        const { data: prof } = await admin
          .from("profiles").select("id").eq("email", toMember.email).maybeSingle();
        if (prof?.id) {
          await admin.from("app_notifications").insert({
            tenant_id: lead.tenant_id,
            recipient_user_id: prof.id,
            type: "lead_transferred",
            title: "Lead transferido para você",
            body: `🔄 ${leadName} · veio de ${fromName} — se apresente e dê continuidade (não reenvie boas-vindas)`,
            lead_id: lead.id,
          });
        }
      }
    } catch (e) {
      console.error("in-app insert failed", e);
    }

    // WhatsApp via 804
    let delivered = false;
    let waStatus: "sent" | "failed" | "skipped" = "skipped";
    let waError: string | null = null;

    const consultantPhone = onlyDigits(toMember.phone);
    if (toMember.notify_whatsapp === false) {
      waStatus = "skipped";
      waError = "consultant has notify_whatsapp disabled";
    } else if (!consultantPhone) {
      waStatus = "failed";
      waError = "consultant has no phone";
    } else {
      const sender = await pickNotifierInstance(admin, lead.tenant_id);
      if (sender?.server_url && sender?.instance_token) {
        try {
          const r = await fetch(`${sender.server_url.replace(/\/$/, "")}/send/text`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: sender.instance_token! },
            body: JSON.stringify({ number: consultantPhone, text, message: text }),
          });
          delivered = r.ok;
          waStatus = r.ok ? "sent" : "failed";
          if (!r.ok) waError = `http ${r.status}: ${(await r.text()).slice(0, 200)}`;
        } catch (e) {
          console.error("whatsapp send error", e);
          waStatus = "failed";
          waError = String(e);
        }
      } else {
        waStatus = "failed";
        waError = "no connected notifier (804) instance";
      }
    }

    try {
      await admin.from("lead_notifications").insert({
        tenant_id: lead.tenant_id,
        lead_id: lead.id,
        type: "lead_transferred",
        recipient_phone: consultantPhone || null,
        recipient_member_id: toMember.id,
        message_sent: text,
        delivered,
      });
    } catch (e) {
      console.error("lead_notifications insert failed", e);
    }

    return json({ ok: true, wa_status: waStatus, wa_error: waError });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
