// Superadmin impersonation: generate a magic-link token_hash for the tenant owner.
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
      return json({ error: "missing auth" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "invalid auth" }, 401);
    const adminUserId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE);

    // verify superadmin
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", adminUserId)
      .eq("role", "superadmin")
      .maybeSingle();
    if (!roleRow) return json({ error: "not superadmin" }, 403);

    const body = await req.json().catch(() => ({}));
    const tenantId = body?.tenant_id as string | undefined;
    if (!tenantId) return json({ error: "tenant_id required" }, 400);

    // find owner of tenant
    const { data: membership, error: mErr } = await admin
      .from("tenant_memberships")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("role", "owner")
      .maybeSingle();
    if (mErr || !membership) return json({ error: "owner not found" }, 404);

    const { data: targetUser, error: tErr } = await admin.auth.admin.getUserById(membership.user_id);
    if (tErr || !targetUser?.user?.email) return json({ error: "owner email not found" }, 404);
    const email = targetUser.user.email;

    // Generate magic link → returns hashed_token usable with verifyOtp
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      return json({ error: linkErr?.message ?? "failed to generate link" }, 500);
    }

    // log
    await admin.from("impersonation_log").insert({
      admin_user_id: adminUserId,
      target_user_id: membership.user_id,
      tenant_id: tenantId,
      reason: body?.reason ?? null,
    });

    return json({
      email,
      token_hash: linkData.properties.hashed_token,
      target_user_id: membership.user_id,
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
