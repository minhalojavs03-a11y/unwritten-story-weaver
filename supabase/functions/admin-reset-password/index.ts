// ONE-OFF: reset Ediane password. Delete after use.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const USER_ID = "714d4db0-4f5a-4b95-8d46-962111d9e92e";
const NEW_PASSWORD = "donofera123!";

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
