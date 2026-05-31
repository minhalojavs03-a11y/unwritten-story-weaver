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

    // find best member to impersonate: prefer owner, fall back to supervisor or any member.
    const { data: memberships, error: mErr } = await admin
      .from("tenant_memberships")
      .select("user_id, role, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });
    if (mErr) return json({ error: mErr.message }, 500);

    const rolePriority: Record<string, number> = { owner: 0, supervisor: 1, consultant: 2, attendant: 3 };
    const sorted = (memberships ?? []).slice().sort(
      (a, b) => (rolePriority[a.role] ?? 99) - (rolePriority[b.role] ?? 99),
    );
    let membership = sorted[0] ?? null;

    // Self-heal: tenant without any membership but with a profile pointing to it.
    if (!membership) {
      const { data: profile } = await admin
        .from("profiles")
        .select("id, display_name, email")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (profile?.id) {
        const { error: insertErr } = await admin.from("tenant_memberships").insert({
          tenant_id: tenantId,
          user_id: profile.id,
          role: "owner",
          display_name: profile.display_name ?? (profile.email ?? "").split("@")[0] ?? "Dono",
        });
        if (!insertErr) membership = { user_id: profile.id, role: "owner", created_at: new Date().toISOString() } as any;
      }
    }

    if (!membership) {
      return json({ error: "Esta conta ainda não tem nenhum usuário vinculado. Cadastre um dono antes de acessar." }, 404);
    }

    console.log("[impersonate] tenant", tenantId, "membership", membership);
    const { data: targetUser, error: tErr } = await admin.auth.admin.getUserById(membership.user_id);
    if (tErr) console.log("[impersonate] getUserById error", tErr);
    if (tErr || !targetUser?.user?.email) {
      return json({ error: `target user email not found: ${tErr?.message ?? "no email"}` }, 404);
    }
    const email = targetUser.user.email;

    // Make sure the user's profile points to this tenant so the app loads with the right context.
    const { error: profUpdErr } = await admin.from("profiles").update({ tenant_id: tenantId }).eq("id", membership.user_id);
    if (profUpdErr) console.log("[impersonate] profile update err", profUpdErr);

    // Generate magic link → returns hashed_token usable with verifyOtp
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr) console.log("[impersonate] generateLink error", linkErr);
    if (linkErr || !linkData?.properties?.hashed_token) {
      return json({ error: `magic link failed: ${linkErr?.message ?? "no token"}` }, 500);
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
