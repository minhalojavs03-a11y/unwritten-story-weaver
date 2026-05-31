// Superadmin context switch: updates the superadmin's profiles.tenant_id
// to the target tenant. No magic link, no signOut — keeps the session.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      console.log("[impersonate] missing auth header");
      return json({ error: "missing auth" }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE);
    const token = authHeader.slice("Bearer ".length);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      console.log("[impersonate] invalid auth:", userErr?.message);
      return json({ error: `invalid auth: ${userErr?.message ?? "no user"}` }, 401);
    }
    const adminUserId = userData.user.id;

    const { data: roleRow, error: roleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", adminUserId)
      .eq("role", "superadmin")
      .maybeSingle();
    if (roleErr) console.log("[impersonate] role query err:", roleErr.message);
    if (!roleRow) {
      console.log("[impersonate] not superadmin user=", adminUserId);
      return json({ error: "not superadmin" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const tenantId = body?.tenant_id as string | undefined;
    if (!tenantId) return json({ error: "tenant_id required" }, 400);

    const { data: tenant, error: tenantErr } = await admin
      .from("tenants")
      .select("id, name")
      .eq("id", tenantId)
      .maybeSingle();
    if (tenantErr || !tenant) return json({ error: "tenant not found" }, 404);

    // Save the previous tenant so the UI can restore on exit
    const { data: prevProfile } = await admin
      .from("profiles")
      .select("tenant_id")
      .eq("id", adminUserId)
      .maybeSingle();
    const previousTenantId = prevProfile?.tenant_id ?? null;

    const { error: updErr } = await admin
      .from("profiles")
      .update({ tenant_id: tenantId, updated_at: new Date().toISOString() })
      .eq("id", adminUserId);
    if (updErr) return json({ error: `profile update failed: ${updErr.message}` }, 500);

    await admin.from("impersonation_log").insert({
      admin_user_id: adminUserId,
      target_user_id: adminUserId,
      tenant_id: tenantId,
      reason: body?.reason ?? null,
    });

    return json({
      tenant_id: tenantId,
      tenant_name: tenant.name,
      previous_tenant_id: previousTenantId,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
