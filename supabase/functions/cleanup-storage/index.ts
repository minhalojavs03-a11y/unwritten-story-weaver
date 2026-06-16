import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "unauth" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: isSuper } = await admin.rpc("has_app_role", { _user_id: u.user.id, _role: "superadmin" });
    if (!isSuper) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const bucket: string = body?.bucket ?? "chat-media";
    const maxBatches: number = body?.max_batches ?? 200;

    let totalDeleted = 0;
    for (let i = 0; i < maxBatches; i++) {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/objects?select=name&bucket_id=eq.${encodeURIComponent(bucket)}&limit=1000`,
        { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Accept-Profile": "storage" } },
      );
      if (!res.ok) return json({ error: `list failed: ${res.status} ${await res.text()}`, deleted: totalDeleted }, 500);
      const rows = await res.json() as Array<{ name: string }>;
      if (!rows.length) break;
      const names = rows.map((r) => r.name);
      const { error: delErr } = await admin.storage.from(bucket).remove(names);
      if (delErr) return json({ error: delErr.message, deleted: totalDeleted }, 500);
      totalDeleted += names.length;
      if (names.length < 1000) break;
    }

    return json({ ok: true, bucket, deleted: totalDeleted });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}
