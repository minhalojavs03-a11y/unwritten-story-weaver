import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const { data, error } = await supabase.from("coaching_insights")
  .select("*, lead:leads(id,name,phone), member:tenant_members(id,display_name,avatar_color,avatar_url)")
  .limit(1);

if (error) {
  console.log("Error type:", error.code);
  console.log("Error message:", error.message);
} else {
  console.log("Success! Data length:", data?.length);
}
