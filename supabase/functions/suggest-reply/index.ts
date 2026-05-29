import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const responseHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

async function buildSystemPrompt(admin: any, tenantId: string, tenantName: string | undefined, aiCfg: any) {
  const parts: string[] = [];
  const name = tenantName ?? "nossa administradora de consórcios";
  parts.push(`Você é o consultor virtual da ${name}, ajudando UM VENDEDOR HUMANO a redigir a próxima mensagem no WhatsApp para o cliente. Tom: ${aiCfg?.tone ?? "amigavel"}.

REGRAS:
- Gere APENAS o texto da próxima mensagem do vendedor (sem prefixos, sem aspas, sem "Vendedor:", sem markdown).
- Máximo 2 frases curtas (idealmente 1). Limite ~280 caracteres. UMA pergunta por vez.
- Texto corrido, no máximo 1 emoji quando fizer sentido.
- Use SOMENTE as informações abaixo. Nunca invente valores, taxas ou regras.
- Se o cliente pediu humano, apenas confirme que um consultor já está sendo chamado.`);

  if (aiCfg?.business_description) parts.push(`SOBRE:\n${aiCfg.business_description}`);
  const contact: string[] = [];
  if (aiCfg?.address) contact.push(`Endereço: ${aiCfg.address}`);
  if (aiCfg?.phone) contact.push(`Telefone: ${aiCfg.phone}`);
  if (aiCfg?.whatsapp) contact.push(`WhatsApp: ${aiCfg.whatsapp}`);
  if (aiCfg?.website) contact.push(`Site: ${aiCfg.website}`);
  if (contact.length) parts.push(`CONTATO:\n${contact.join("\n")}`);
  if (aiCfg?.services) parts.push(`SEGMENTOS:\n${aiCfg.services}`);
  if (aiCfg?.insurance_plans) parts.push(`PARCEIROS:\n${aiCfg.insurance_plans}`);
  if (aiCfg?.payment_methods) parts.push(`PAGAMENTO:\n${aiCfg.payment_methods}`);
  if (aiCfg?.differentials) parts.push(`DIFERENCIAIS:\n${aiCfg.differentials}`);
  if (aiCfg?.extra_notes) parts.push(`OBS:\n${aiCfg.extra_notes}`);

  const { data: hours } = await admin.from("business_hours").select("*").eq("tenant_id", tenantId).order("weekday");
  if (hours?.length) {
    const lines = hours.map((h: any) => `${WEEKDAYS[h.weekday]}: ${h.is_closed ? "Fechado" : `${h.open_time ?? "-"} às ${h.close_time ?? "-"}`}`);
    parts.push(`HORÁRIOS:\n${lines.join("\n")}`);
  }
  const { data: faqs } = await admin.from("faqs").select("question,answer").eq("tenant_id", tenantId).order("position");
  if (faqs?.length) parts.push(`FAQ:\n${faqs.map((f: any) => `P: ${f.question}\nR: ${f.answer}`).join("\n\n")}`);
  if (aiCfg?.system_prompt) parts.push(`INSTRUÇÕES ADICIONAIS:\n${aiCfg.system_prompt}`);

  return parts.join("\n\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Sessão expirada. Entre novamente para usar a IA." }, 401);

    const { conversation_id } = await req.json();
    if (!conversation_id) return json({ error: "conversation_id obrigatório" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: conv } = await admin.from("conversations").select("*, lead:leads(*)").eq("id", conversation_id).maybeSingle();
    if (!conv) return json({ error: "conversa não encontrada" }, 404);

    const tenantId = conv.tenant_id;
    const [{ data: profile }, { data: roleRows }] = await Promise.all([
      admin.from("profiles").select("tenant_id").eq("id", authData.user.id).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", authData.user.id),
    ]);
    const isSuperadmin = (roleRows ?? []).some((r: any) => r.role === "superadmin");
    if (!isSuperadmin && profile?.tenant_id !== tenantId) return json({ error: "Você não tem acesso a esta conversa." }, 403);

    const [{ data: tenant }, { data: aiCfg }, { data: msgs }] = await Promise.all([
      admin.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
      admin.from("ai_config").select("*").eq("tenant_id", tenantId).maybeSingle(),
      admin.from("messages").select("direction,body,content,created_at").eq("conversation_id", conversation_id).order("created_at", { ascending: false }).limit(20),
    ]);

    const history = (msgs ?? []).slice().reverse();
    if (!history.length) return json({ error: "sem histórico para sugerir" }, 400);

    const systemPrompt = await buildSystemPrompt(admin, tenantId, tenant?.name, aiCfg);
    const leadName = conv.lead?.name ?? "cliente";

    const chatMessages = [
      { role: "system", content: `${systemPrompt}\n\nCliente: ${leadName}` },
      ...history.map((m: any) => ({
        role: m.direction === "inbound" ? "user" : "assistant",
        content: m.body ?? m.content ?? "",
      })).filter((m) => m.content),
      { role: "user", content: "[Gere agora APENAS o texto da próxima mensagem que o vendedor deve enviar ao cliente, seguindo as regras.]" },
    ];

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: chatMessages }),
    });

    if (!r.ok) {
      const t = await r.text();
      console.error("ai gateway error", r.status, t);
      if (r.status === 429) return json({ error: "Limite da IA atingido. Tente em alguns segundos." }, 429);
      if (r.status === 402) return json({ error: "Créditos da IA esgotados." }, 402);
      return json({ error: `IA ${r.status}` }, 500);
    }

    const data = await r.json();
    let suggested = (data?.choices?.[0]?.message?.content ?? "").trim();
    suggested = suggested.replace(/^["'`]+|["'`]+$/g, "").replace(/^\*+|\*+$/g, "").trim();
    if (!suggested) return json({ error: "IA não retornou sugestão" }, 500);

    return json({ suggested_reply: suggested });
  } catch (e: any) {
    console.error("suggest-reply error", e);
    return json({ error: e?.message ?? "erro desconhecido" }, 500);
  }
});
