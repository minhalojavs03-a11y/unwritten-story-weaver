import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FERACON_TENANT_ID = "9ecb99e2-50ee-404f-920b-81cd94cc685e";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function registerWebhook(instance: any): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!instance?.server_url || !instance?.instance_token || !instance?.webhook_secret) {
    return { ok: false, error: "missing fields" };
  }
  try {
    const r = await fetch(`${instance.server_url}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: instance.instance_token },
      body: JSON.stringify({
        url: `${SUPABASE_URL}/functions/v1/whatsapp-webhook?secret=${instance.webhook_secret}`,
        enabled: true,
        events: ["messages"],
        excludeMessages: ["wasSentByApi", "isGroupYes"],
        addUrlTypesMessages: true,
        addUrlEvents: false,
      }),
    });
    return { ok: r.ok, status: r.status };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: instances, error } = await admin
      .from("whatsapp_instances")
      .select("*")
      .eq("tenant_id", FERACON_TENANT_ID)
      .eq("is_connected", true);
    if (error) throw error;

    const results: any[] = [];
    for (const inst of instances ?? []) {
      const res = await registerWebhook(inst);
      results.push({
        id: inst.id,
        seller: inst.seller_name,
        phone: inst.phone_number,
        ...res,
      });
    }
    return json({ total: results.length, results });
  } catch (e: any) {
    console.error("reregister-webhooks error", e);
    return json({ error: e?.message ?? "erro" }, 500);
  }
});
