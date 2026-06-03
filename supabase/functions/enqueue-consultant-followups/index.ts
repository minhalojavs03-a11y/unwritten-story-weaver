// Scans unassigned leads and enqueues follow-up announcements to consultants
// of the matching tier when the AI has finished pre-attendance OR when the
// lead has been idle for too long. Throttled via notification_queue (3 min
// between announcements). Triggered by pg_cron every ~10 min.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PRE_ATTENDANCE_TYPE = "consultant_pre_attendance_done";
const IDLE_TYPE = "consultant_lead_idle";

// Thresholds (minutes)
const PRE_ATTENDANCE_QUIET_MIN = 15;  // last lead msg older than this and AI replied
const IDLE_THRESHOLD_MIN = 90;        // no activity for this long → idle
const IDLE_REPEAT_HOURS = 6;          // re-notify idle no more than once per window

function brl(n: number | null | undefined) {
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(n));
  } catch { return `R$ ${n}`; }
}
function normalizePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const d = p.replace(/\D/g, "");
  if (d.length < 10) return null;
  if (d.startsWith("55")) return d;
  return "55" + d;
}

function preAttendanceMessage(lead: any, credit: number | null) {
  return [
    `✅ *Pré-atendimento concluído pela IA!*`,
    ``,
    `*Lead:* ${lead.name || "(sem nome)"}`,
    `*Valor da carta:* ${brl(credit)}`,
    lead.asset_type ? `*Bem:* ${lead.asset_type}` : null,
    ``,
    `🤖 A IA já aqueceu a conversa e levantou interesse. *Hora de você assumir e fechar.*`,
    ``,
    `⚡ Quem clicar em *"Assumir conversa"* primeiro fica com o lead. Não perca tempo!`,
    ``,
    `_Equipe FeraCon 🦁_`,
  ].filter(Boolean).join("\n");
}

function idleMessage(lead: any, credit: number | null, minutesIdle: number) {
  const idleLabel = minutesIdle >= 60
    ? `${Math.floor(minutesIdle / 60)}h`
    : `${minutesIdle}min`;
  return [
    `⚠️ *Lead parado há ${idleLabel} sem atendimento!*`,
    ``,
    `*Lead:* ${lead.name || "(sem nome)"}`,
    `*Valor da carta:* ${brl(credit)}`,
    lead.asset_type ? `*Bem:* ${lead.asset_type}` : null,
    ``,
    `🥶 Cada minuto parado é um lead esfriando. Entre agora antes que ele perca o interesse ou outro consultor assuma.`,
    ``,
    `_Equipe FeraCon 🦁_`,
  ].filter(Boolean).join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  try {
    const now = Date.now();
    const sinceWindow = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    // Unassigned leads with credit_value, recently active (last 48h)
    const recent = new Date(now - 48 * 60 * 60 * 1000).toISOString();
    const { data: leads } = await admin
      .from("leads")
      .select("id, tenant_id, name, phone, credit_value, asset_type, assigned_member_id, last_interaction_at, last_message_at, created_at")
      .eq("kind", "lead")
      .is("assigned_member_id", null)
      .not("credit_value", "is", null)
      .gte("created_at", recent);


    const summary: any[] = [];

    for (const lead of leads ?? []) {
      // Find tier
      const { data: tierRow } = await admin
        .from("tenant_members")
        .select("max_credit_value")
        .eq("tenant_id", lead.tenant_id)
        .eq("is_active", true)
        .not("max_credit_value", "is", null)
        .gte("max_credit_value", lead.credit_value!)
        .order("max_credit_value", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!tierRow?.max_credit_value) continue;

      const { data: consultants } = await admin
        .from("tenant_members")
        .select("id, display_name, phone")
        .eq("tenant_id", lead.tenant_id)
        .eq("is_active", true)
        .eq("max_credit_value", tierRow.max_credit_value)
        .not("phone", "is", null);
      if (!consultants?.length) continue;

      // Pull last 30 messages for the lead
      const { data: msgs } = await admin
        .from("messages")
        .select("direction, sent_by, created_at, body, content")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(30);
      const messages = msgs ?? [];
      const lastMsgAt = messages[0] ? new Date(messages[0].created_at).getTime() : 0;
      if (!lastMsgAt) continue;

      const inbound = messages.filter((m) => m.direction === "inbound");
      // AI/auto outbound = no sent_by (sent by edge functions); manual seller msgs have sent_by
      const aiOutbound = messages.filter((m) => m.direction === "outbound" && !m.sent_by);
      const lastInboundAt = inbound[0] ? new Date(inbound[0].created_at).getTime() : 0;
      const minutesSinceLast = Math.floor((now - lastMsgAt) / 60_000);

      // Helper: was a follow-up of this type already sent in last 24h?
      async function alreadySent(type: string, sinceISO: string) {
        const { data } = await admin
          .from("lead_notifications")
          .select("id")
          .eq("lead_id", lead.id)
          .eq("type", type)
          .gte("sent_at", sinceISO)
          .limit(1)
          .maybeSingle();
        return !!data;
      }

      // 1) Pre-attendance done: AI replied >=2x, lead responded at least once, last activity quiet
      const preDone =
        aiOutbound.length >= 2 &&
        inbound.length >= 1 &&
        lastInboundAt > 0 &&
        (now - lastInboundAt) >= PRE_ATTENDANCE_QUIET_MIN * 60_000 &&
        !(await alreadySent(PRE_ATTENDANCE_TYPE, sinceWindow));

      // 2) Idle: no activity for IDLE_THRESHOLD_MIN
      const idle =
        minutesSinceLast >= IDLE_THRESHOLD_MIN &&
        !(await alreadySent(IDLE_TYPE, new Date(now - IDLE_REPEAT_HOURS * 60 * 60 * 1000).toISOString()));

      if (!preDone && !idle) continue;

      const kind = preDone ? "pre" : "idle";
      const text = preDone
        ? preAttendanceMessage(lead, lead.credit_value)
        : idleMessage(lead, lead.credit_value, minutesSinceLast);
      const notifType = preDone ? PRE_ATTENDANCE_TYPE : IDLE_TYPE;

      // Find current max due_at for announcements (global throttle ~3min apart)
      const { data: lastDue } = await admin
        .from("notification_queue")
        .select("due_at")
        .eq("type", "announcement")
        .in("status", ["pending", "processing"])
        .order("due_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let cursor = Math.max(now, lastDue ? new Date(lastDue.due_at).getTime() : 0);

      for (const c of consultants) {
        const phone = normalizePhone(c.phone);
        if (!phone) continue;
        cursor += 3 * 60_000; // 3 min apart
        await admin.from("notification_queue").insert({
          tenant_id: lead.tenant_id,
          lead_id: lead.id,
          type: "announcement",
          recipient_phone: phone,
          message_text: text,
          due_at: new Date(cursor).toISOString(),
        });
        // Mark notification so we don't re-enqueue next cron tick
        await admin.from("lead_notifications").insert({
          tenant_id: lead.tenant_id,
          lead_id: lead.id,
          type: notifType,
          recipient_phone: phone,
          recipient_member_id: c.id,
          message_sent: text,
          delivered: false,
        });
      }
      summary.push({ lead_id: lead.id, kind, consultants: consultants.length });
    }

    return new Response(JSON.stringify({ ok: true, processed: summary.length, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
