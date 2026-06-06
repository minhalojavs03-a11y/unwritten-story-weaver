import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const FERACON_TENANT_ID = "9ecb99e2-50ee-404f-920b-81cd94cc685e";

// Destinatários do alerta de saúde do WhatsApp.
const RECIPIENTS = [
  { name: "Ediane (Dona)", phone: "554599874647" },
  { name: "Antonio (Supervisor)", phone: "554891218235" },
  { name: "Arley (cópia)", phone: "5517997091070" },
];

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
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Carrega instâncias do tenant Feracon + nomes dos consultores.
    const { data: instances, error: instErr } = await admin
      .from("whatsapp_instances")
      .select("id,instance_name,phone_number,is_connected,status,seller_user_id")
      .eq("tenant_id", FERACON_TENANT_ID);
    if (instErr) return json({ error: instErr.message }, 500);

    const sellerIds = [...new Set((instances ?? []).map((r: any) => r.seller_user_id).filter(Boolean))];
    const profileById = new Map<string, { full_name: string | null; email: string | null }>();
    if (sellerIds.length) {
      const { data: profs } = await admin.from("profiles").select("id,full_name,email").in("id", sellerIds);
      for (const p of profs ?? []) profileById.set(p.id, { full_name: p.full_name, email: p.email });
    }

    const enriched = (instances ?? []).map((i: any) => {
      const prof = i.seller_user_id ? profileById.get(i.seller_user_id) : null;
      const name = prof?.full_name || prof?.email || i.instance_name || "(sem nome)";
      const ok = i.is_connected === true || i.status === "connected";
      return { name, phone: i.phone_number || "—", connected: ok };
    });

    const disconnected = enriched.filter((i) => !i.connected);
    const connected = enriched.filter((i) => i.connected);

    // Escolhe uma instância CONECTADA do tenant para enviar.
    const { data: sender } = await admin
      .from("whatsapp_instances")
      .select("server_url,instance_token")
      .eq("tenant_id", FERACON_TENANT_ID)
      .or("is_connected.eq.true,status.eq.connected")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!sender?.server_url || !sender?.instance_token) {
      return json({ error: "Nenhuma instância conectada para enviar o aviso." }, 400);
    }

    const header = disconnected.length > 0
      ? `🚨 *URGENTE — WhatsApp da equipe Feracon*`
      : `✅ *Status WhatsApp da equipe Feracon*`;

    const explain = [
      ``,
      `O CRM da Feracon foi projetado para funcionar com o WhatsApp de *cada consultor conectado o tempo todo*.`,
      ``,
      `Quando um número fica desconectado, o sistema *não consegue*:`,
      `• Receber respostas dos leads`,
      `• Distribuir leads para o consultor`,
      `• Registrar conversas no histórico`,
      `• Classificar temperatura e estágio`,
      `• Disparar automações e follow-ups`,
      `• Notificar a equipe sobre novos contatos`,
      ``,
      `*Grande parte dos relatos de "falha no sistema" vem exatamente disso* — não é bug do software, é WhatsApp fora do ar. Reconectar é prioridade máxima para a operação não travar.`,
    ].join("\n");

    const discList = disconnected.length
      ? [`\n❌ *Desconectados (${disconnected.length}):*`, ...disconnected.map((d) => `• ${d.name} — ${d.phone}`)].join("\n")
      : `\n✅ Todos conectados.`;

    const connList = connected.length
      ? [`\n🟢 *Conectados (${connected.length}):*`, ...connected.map((d) => `• ${d.name} — ${d.phone}`)].join("\n")
      : `\n⚠️ Nenhum WhatsApp conectado.`;

    const message = [header, explain, discList, connList, ``, `_Aviso enviado a partir do painel Feracon._`].join("\n");

    const results = await Promise.all(
      RECIPIENTS.map(async (rcp) => {
        try {
          const r = await fetch(`${sender.server_url}/send/text`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: sender.instance_token! },
            body: JSON.stringify({ number: rcp.phone, text: message }),
          });
          const ok = r.ok;
          await admin.from("lead_notifications").insert({
            tenant_id: FERACON_TENANT_ID,
            type: "whatsapp_health_alert",
            recipient_phone: rcp.phone,
            message_sent: message,
            delivered: ok,
          });
          return { recipient: rcp.name, ok };
        } catch (e) {
          return { recipient: rcp.name, ok: false, error: String(e) };
        }
      }),
    );

    return json({ ok: true, disconnected: disconnected.length, connected: connected.length, results });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
