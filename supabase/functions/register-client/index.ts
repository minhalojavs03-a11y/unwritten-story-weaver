import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RegisterPayload = {
  email?: string;
  password?: string;
  fullName?: string;
  tenantName?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "loja";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  let createdUserId: string | null = null;

  try {
    const payload = (await req.json()) as RegisterPayload;
    const email = payload.email?.trim().toLowerCase() ?? "";
    const password = payload.password ?? "";
    const fullName = payload.fullName?.trim() ?? "";
    const tenantName = (payload.tenantName?.trim() || fullName || email.split("@")[0] || "Minha ótica").slice(0, 80);

    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Informe um email válido." }, 400);
    if (password.length < 6) return json({ error: "A senha deve ter ao menos 6 caracteres." }, 400);
    if (tenantName.length < 2) return json({ error: "Informe o nome da loja." }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("register-client missing Supabase service configuration");
      return json({ error: "Cadastro indisponível no momento." }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || tenantName },
    });

    if (createUserError) {
      if (/already|registered|exists/i.test(createUserError.message)) {
        return json({ error: "Este email já possui uma conta. Faça login." }, 409);
      }
      console.error("register-client create user error", createUserError);
      return json({ error: "Não foi possível criar sua conta agora." }, 500);
    }

    createdUserId = createdUser.user?.id ?? null;
    if (!createdUserId) return json({ error: "Não foi possível criar sua conta agora." }, 500);

    const slug = `${slugify(tenantName)}-${crypto.randomUUID().slice(0, 6)}`;
    const { data: tenant, error: tenantError } = await admin
      .from("tenants")
      .insert({ name: tenantName, slug, plan: "starter", status: "active" })
      .select("id")
      .single();

    if (tenantError || !tenant) throw tenantError ?? new Error("tenant not created");

    const tenantId = tenant.id as string;
    const { error: profileError } = await admin.from("profiles").upsert({
      id: createdUserId,
      tenant_id: tenantId,
      full_name: fullName || tenantName,
      email,
    });
    if (profileError) throw profileError;

    const { error: roleError } = await admin
      .from("user_roles")
      .insert({ user_id: createdUserId, role: "owner", tenant_id: tenantId });
    if (roleError) throw roleError;

    const { error: aiConfigError } = await admin.from("ai_config").insert({ tenant_id: tenantId });
    if (aiConfigError && !/duplicate|unique/i.test(aiConfigError.message)) throw aiConfigError;

    return json({ ok: true });
  } catch (error) {
    console.error("register-client error", error);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (createdUserId && supabaseUrl && serviceRoleKey) {
      const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await admin.auth.admin.deleteUser(createdUserId).catch((cleanupError) => {
        console.error("register-client cleanup error", cleanupError);
      });
    }

    return json({ error: "Não foi possível concluir o cadastro. Tente novamente." }, 500);
  }
});