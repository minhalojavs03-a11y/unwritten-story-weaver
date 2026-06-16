// One-shot cleanup: remove all objects from the chat-media bucket.
// Only callable by superadmin.
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
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return new Response(JSON.stringify({ error: "unauth" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: isSuper } = await admin.rpc("has_app_role", { _user_id: u.user.id, _role: "superadmin" });
    if (!isSuper) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const bucket = body?.bucket ?? "chat-media";

    let totalDeleted = 0;
    while (true) {
      // List up to 1000 names directly from storage.objects (read is allowed)
      const { data: rows, error } = await admin
        .from("objects")
        .select("name")
        .eq("bucket_id", bucket)
        .limit(1000) as any;
      // Fallback: query via schema 'storage'
      let names: string[] = [];
      if (error || !rows) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/objects?select=name&bucket_id=eq.${bucket}&limit=1000`, {
          headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Accept-Profile": "storage" },
        });
        names = (await res.json()).map((r: any) => r.name);
      } else {
        names = rows.map((r: any) => r.name);
      }
      if (names.length === 0) break;
      const { error: delErr } = await admin.storage.from(bucket).remove(names);
      if (delErr) return new Response(JSON.stringify({ error: delErr.message, deleted: totalDeleted }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
      totalDeleted += names.length;
      if (names.length < 1000) break;
    }

    return new Response(JSON.stringify({ ok: true, deleted: totalDeleted }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
