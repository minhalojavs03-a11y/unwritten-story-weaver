// Drains the notification_queue. Pulls one due item per type per run.
// Run by pg_cron every minute. Welcomes pace = 1/min, consultant = 1 per 3 min
// (controlled by due_at when items are enqueued).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FN_BY_TYPE: Record<string, string> = {
  welcome: "send-lead-welcome",
  consultant_tier_match: "notify-consultant-by-tier",
};

// Jitter curto humanizado (o anterior chegava a 150s e estourava o timeout).
async function randomSendDelay(): Promise<void> {
  const ms = 1500 + Math.floor(Math.random() * 4500);
  await new Promise((r) => setTimeout(r, ms));
}

async function processOne(admin: ReturnType<typeof createClient>, type: string) {
  // Claim oldest due pending row of this type.
  const { data: candidate } = await admin
    .from("notification_queue")
    .select("id, tenant_id, lead_id, attempts, recipient_phone, message_text")
    .eq("type", type)
    .eq("status", "pending")
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!candidate) return { type, skipped: "none due" };

  const { data: claimed } = await admin
    .from("notification_queue")
    .update({ status: "processing", attempts: (candidate.attempts ?? 0) + 1 })
    .eq("id", candidate.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!claimed) return { type, skipped: "race" };

  try {
    let ok = false;
    let errText = "";
    let status = 0;

    if (type === "announcement") {
      // Send a free-text message directly to a phone via the tenant's instance.
      const { data: instance } = await admin
        .from("whatsapp_instances")
        .select("server_url,instance_token")
        .eq("tenant_id", candidate.tenant_id)
        .or("is_connected.eq.true,status.eq.connected")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!instance?.server_url || !instance?.instance_token) {
        throw new Error("no connected whatsapp instance");
      }
      const phone = String(candidate.recipient_phone || "").replace(/\D/g, "");
      const text = candidate.message_text || "";
      if (!phone || !text) throw new Error("missing phone or message_text");
      await randomSendDelay();
      const r = await fetch(`${instance.server_url.replace(/\/$/, "")}/send/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: instance.instance_token },
        body: JSON.stringify({ number: phone, text, message: text }),
      });
      status = r.status;
      ok = r.ok;
      if (!ok) errText = (await r.text()).slice(0, 300);
      else {
        await admin.from("lead_notifications").insert({
          tenant_id: candidate.tenant_id,
          lead_id: candidate.lead_id,
          type: "announcement",
          recipient_phone: phone,
          message_sent: text,
          delivered: true,
        });
      }
    } else {
      const fn = FN_BY_TYPE[type];
      const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE}`,
          apikey: SERVICE_ROLE,
        },
        body: JSON.stringify({ lead_id: candidate.lead_id }),
      });
      status = res.status;
      const txt = await res.text();
      ok = res.ok;
      if (!ok) errText = `HTTP ${res.status}: ${txt.slice(0, 300)}`;
    }

    if (!ok) {
      await admin.from("notification_queue").update({
        status: candidate.attempts && candidate.attempts >= 3 ? "error" : "pending",
        last_error: errText,
        due_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      }).eq("id", candidate.id);
      return { type, lead_id: candidate.lead_id, ok: false, status };
    }
    await admin.from("notification_queue").update({
      status: "done",
      processed_at: new Date().toISOString(),
      last_error: null,
    }).eq("id", candidate.id);
    return { type, lead_id: candidate.lead_id, ok: true };
  } catch (e) {
    await admin.from("notification_queue").update({
      status: "pending",
      last_error: String(e),
      due_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    }).eq("id", candidate.id);
    return { type, lead_id: candidate.lead_id, ok: false, error: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  // One of each per run (cron = every minute). Pacing per type is controlled by due_at.
  const results = await Promise.all([
    processOne(admin, "welcome"),
    processOne(admin, "consultant_tier_match"),
    processOne(admin, "announcement"),
  ]);
  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
