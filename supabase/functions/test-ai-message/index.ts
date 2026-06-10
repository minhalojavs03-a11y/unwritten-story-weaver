import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const AI_URL = GEMINI_API_KEY
  ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
  : "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_KEY = GEMINI_API_KEY || LOVABLE_API_KEY;
const AI_MODEL = GEMINI_API_KEY ? "gemini-2.5-flash" : "google/gemini-2.5-flash";

function aiHeaders() {
  return GEMINI_API_KEY
    ? { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" }
    : { "Lovable-API-Key": LOVABLE_API_KEY, "Content-Type": "application/json" };
}

// === Delay humano leve antes de cada envio (modo normal pós-manutenção).
async function randomSendDelay(): Promise<void> {
  // Modo normal: pequeno jitter humano (1.5s–4s) para não parecer robô,
  // sem os longos delays do modo manutenção.
  let ms = 1500 + Math.floor(Math.random() * 2500);
  if (Math.random() < 0.05) ms += 3000 + Math.floor(Math.random() * 7000);
  await new Promise((r) => setTimeout(r, ms));
}

const TEST_PHONE = "5517997091070";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Tenant do usuário
    const { data: profile } = await admin
      .from("profiles")
      .select("tenant_id")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile?.tenant_id) return json({ error: "Sem tenant" }, 400);

    // Pega instância conectada
    const { data: instances } = await admin
      .from("whatsapp_instances")
      .select("*")
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: true });
    const instance = (instances ?? []).find(
      (i: any) => i.is_connected === true || i.status === "connected",
    );
    if (!instance) return json({ error: "Nenhuma instância WhatsApp conectada" }, 400);
    if (!instance.server_url || !instance.instance_token) {
      return json({ error: "Instância sem credenciais do provedor" }, 400);
    }

    // Carrega contexto da IA do tenant
    const { data: aiCfg } = await admin
      .from("ai_config")
      .select("*")
      .eq("tenant_id", profile.tenant_id)
      .maybeSingle();
    const { data: tenant } = await admin
      .from("tenants")
      .select("name")
      .eq("id", profile.tenant_id)
      .maybeSingle();

    const systemPrompt = `Você é um atendente virtual da empresa ${tenant?.name ?? ""}.
${aiCfg?.business_description ? `Sobre a empresa: ${aiCfg.business_description}` : ""}
${aiCfg?.tone ? `Tom: ${aiCfg.tone}.` : "Tom: amigável e profissional."}
Gere uma mensagem CURTA (2-3 linhas, em português brasileiro) de boas-vindas para um lead de TESTE,
informando que é uma mensagem automática de teste do sistema de pré-atendimento com IA.
Não faça perguntas. Apenas saudação simpática + confirmação que o canal está funcionando.`;

    const aiResp = await fetch(AI_URL, {
      method: "POST",
      headers: aiHeaders(),
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Gere a mensagem de teste agora." },
        ],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      if (aiResp.status === 429) return json({ error: "Limite de requisições da IA atingido." }, 429);
      if (aiResp.status === 402) return json({ error: "Créditos da IA esgotados." }, 402);
      console.error("AI error", aiResp.status, errText);
      return json({ error: "Falha ao gerar mensagem com IA" }, 500);
    }
    const aiJson = await aiResp.json();
    const text: string =
      aiJson?.choices?.[0]?.message?.content?.toString().trim() ||
      "🤖 Mensagem de teste — pré-atendimento com IA está funcionando.";

    // Envia direto via provedor (mesmo endpoint usado pelo whatsapp-manage)
    await randomSendDelay();
    const sendResp = await fetch(
      `${instance.server_url.replace(/\/$/, "")}/send/text`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          token: instance.instance_token,
        },
        body: JSON.stringify({ number: TEST_PHONE, text }),
      },
    );
    const rawSend = await sendResp.text();
    if (!sendResp.ok) {
      console.error("send provider error", sendResp.status, rawSend);
      return json({ error: "Falha ao enviar pelo WhatsApp", detail: rawSend.slice(0, 300) }, 502);
    }

    // Garante lead + conversation + registra mensagem outbound
    let { data: lead } = await admin
      .from("leads")
      .select("id, tags")
      .eq("tenant_id", profile.tenant_id)
      .eq("phone", TEST_PHONE)
      .maybeSingle();
    if (!lead) {
      const { data: created } = await admin
        .from("leads")
        .insert({
          tenant_id: profile.tenant_id,
          name: "Lead de Teste",
          phone: TEST_PHONE,
          source: "Teste",
          tags: ["teste"],
          whatsapp_instance_id: instance.id,
          last_message_at: new Date().toISOString(),
        })
        .select("id, tags")
        .single();
      lead = created;
    }
    let { data: conv } = await admin
      .from("conversations")
      .select("id")
      .eq("tenant_id", profile.tenant_id)
      .eq("lead_id", lead!.id)
      .maybeSingle();
    if (!conv) {
      const { data: createdConv } = await admin
        .from("conversations")
        .insert({
          tenant_id: profile.tenant_id,
          lead_id: lead!.id,
          whatsapp_instance_id: instance.id,
          channel: "whatsapp",
          status: "open",
          last_message_at: new Date().toISOString(),
          last_message_preview: text,
        })
        .select("id")
        .single();
      conv = createdConv;
    } else {
      await admin
        .from("conversations")
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: text,
        })
        .eq("id", conv.id);
    }
    await admin.from("messages").insert({
      tenant_id: profile.tenant_id,
      conversation_id: conv!.id,
      lead_id: lead!.id,
      whatsapp_instance_id: instance.id,
      direction: "outbound",
      body: text,
      content: text,
      status: "sent",
      metadata: { test: true, ai: true },
    });

    return json({ ok: true, text, phone: TEST_PHONE });
  } catch (e) {
    console.error("test-ai-message error", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});
