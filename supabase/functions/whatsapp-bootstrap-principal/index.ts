// One-off: provisions the principal WhatsApp instance for a tenant via uazapi admin token.
// No user auth required (uses service role). Intended to be deleted after use.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPI_API_TOKEN = Deno.env.get("WHATSAPI_API_TOKEN") ?? "";
const WHATSAPI_CREATE_URL = Deno.env.get("WHATSAPI_CREATE_URL") ?? "";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!WHATSAPI_API_TOKEN || !WHATSAPI_CREATE_URL) return json({ error: "secrets missing" }, 500);
    const body = await req.json().catch(() => ({}));
    const tenantId = body?.tenant_id;
    const displayName = (body?.name ?? "Principal").toString().slice(0, 60);
    if (!tenantId) return json({ error: "tenant_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: tenant } = await admin.from("tenants").select("id,name,slug").eq("id", tenantId).maybeSingle();
    if (!tenant) return json({ error: "tenant not found" }, 404);

    const { data: existing } = await admin
      .from("whatsapp_instances").select("id").eq("tenant_id", tenantId).limit(1).maybeSingle();
    if (existing) return json({ error: "instance already exists", id: existing.id }, 409);

    const base = WHATSAPI_CREATE_URL.trim().replace(/\/$/, "").replace(/\/instance\/(init|create).*$/, "");
    const fullSlug = `${tenant.slug}-${crypto.randomUUID().slice(0, 8)}`;

    const createResp = await fetch(`${base}/instance/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        admintoken: WHATSAPI_API_TOKEN,
        Authorization: `Bearer ${WHATSAPI_API_TOKEN}`,
      },
      body: JSON.stringify({ name: fullSlug, systemName: displayName }),
    });
    const text = await createResp.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!createResp.ok) return json({ error: "provider failed", status: createResp.status, data }, 502);

    const inst = data?.instance ?? data?.data?.instance ?? data?.data ?? data;
    const server_url = inst?.server_url ?? inst?.serverUrl ?? inst?.host ?? data?.server_url ?? null;
    const instance_token = data?.["Instance Token"] ?? data?.instanceToken ?? data?.instance_token
      ?? inst?.["Instance Token"] ?? inst?.instanceToken ?? inst?.instance_token
      ?? inst?.token ?? inst?.apikey ?? inst?.apiKey ?? inst?.hash ?? data?.token ?? null;
    if (!server_url || !instance_token) return json({ error: "missing server_url/token from provider", data }, 502);

    const { data: saved, error } = await admin.from("whatsapp_instances").insert({
      tenant_id: tenantId,
      instance_name: displayName,
      server_url,
      instance_token,
      status: "connecting",
      is_connected: false,
    }).select("*").single();
    if (error) return json({ error: error.message }, 500);

    // cancel any auto charge
    try {
      await admin.from("instance_charges").update({ status: "canceled", amount: 0 }).eq("whatsapp_instance_id", saved.id);
    } catch {}

    return json({ ok: true, instance: { id: saved.id, instance_name: saved.instance_name, server_url, webhook_secret: saved.webhook_secret } });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
