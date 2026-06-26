// Cron-driven health check for all WhatsApp instances.
// Polls each instance's provider /instance/status, updates is_connected/status,
// and notifies the supervisor (number ending 804) when an instance drops.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NOTIFIER_PHONE_DIGITS = "4792352804";
const ALERT_RECIPIENTS = ["554599874647", "554792352804"]; // Ediane + Antonio

function isConnected(d: any): boolean {
  if (!d || typeof d !== "object") return false;
  const inst = d.instance ?? d;
  const s = (inst.status ?? d.status ?? inst.state ?? "").toString().toLowerCase();
  if (s === "open" || s === "connected") return true;
  if (inst.connected === true || d.connected === true) return true;
  return false;
}

async function pickNotifier(admin: any, tenantId: string) {
  const { data } = await admin
    .from("whatsapp_instances")
    .select("server_url,instance_token")
    .eq("tenant_id", tenantId)
    .or("is_connected.eq.true,status.eq.connected")
    .ilike("phone_number", `%${NOTIFIER_PHONE_DIGITS}%`)
    .maybeSingle();
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: instances } = await admin
    .from("whatsapp_instances")
    .select("id,tenant_id,phone_number,server_url,instance_token,is_connected,status")
    .not("server_url", "is", null)
    .not("instance_token", "is", null);

  const results: any[] = [];
  const dropped: { phone: string; tenantId: string }[] = [];

  for (const inst of instances ?? []) {
    try {
      const r = await fetch(`${inst.server_url.replace(/\/$/, "")}/instance/status`, {
        headers: { token: inst.instance_token! },
      });
      let connected = false;
      if (r.ok) {
        const d = await r.json().catch(() => ({}));
        connected = isConnected(d);
      }
      const wasConnected = !!inst.is_connected;
      if (connected !== wasConnected) {
        await admin.from("whatsapp_instances").update({
          is_connected: connected,
          status: connected ? "connected" : "disconnected",
          updated_at: new Date().toISOString(),
        }).eq("id", inst.id);
        if (wasConnected && !connected) {
          dropped.push({ phone: inst.phone_number || "(sem número)", tenantId: inst.tenant_id });
        }
      }
      results.push({ phone: inst.phone_number, connected });
    } catch (e) {
      results.push({ phone: inst.phone_number, error: String(e) });
    }
  }

  // Alerta supervisores quando alguma cair
  for (const d of dropped) {
    const notifier = await pickNotifier(admin, d.tenantId);
    if (!notifier?.server_url || !notifier?.instance_token) continue;
    const text = `⚠️ *WhatsApp desconectado*\nInstância: ${d.phone}\nReconecte em Meu WhatsApp.`;
    for (const to of ALERT_RECIPIENTS) {
      try {
        await fetch(`${notifier.server_url.replace(/\/$/, "")}/send/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: notifier.instance_token },
          body: JSON.stringify({ number: to, text }),
        });
      } catch (_) { /* ignore */ }
    }
  }

  return new Response(JSON.stringify({ ok: true, checked: results.length, dropped, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
