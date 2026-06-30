// ONE-OFF: reset Lucas Medeiros password. Delete after use.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const USER_ID = "c9bbeed5-1cb5-42b9-91bd-4172f51de3c3";
const NEW_PASSWORD = "Lucas@Feracon2026";

Deno.serve(async () => {
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error } = await admin.auth.admin.updateUserById(USER_ID, { password: NEW_PASSWORD });
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { "content-type": "application/json" } });
  }
});
