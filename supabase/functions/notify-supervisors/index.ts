import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

// === MODO ESTABILIDADE: delay aleatório antes de cada envio (remover quando voltar ao normal).
async function randomSendDelay(): Promise<void> {
  let ms = 5000 + Math.floor(Math.random() * 55000);
  if (Math.random() < 0.1) ms += 30000 + Math.floor(Math.random() * 60000);
  console.log("[stability] sleeping", ms, "ms before send");
  await new Promise((r) => setTimeout(r, ms));
}

// Único número autorizado a enviar avisos internos (supervisor / principal Feracon).
const NOTIFIER_PHONE_DIGITS = "4792352804";

async function pickNotifierInstance(admin: any, tenantId: string) {
  const { data: sup } = await admin
    .from("whatsapp_instances")
    .select("server_url,instance_token,status,is_connected")
    .eq("tenant_id", tenantId)
    .or("is_connected.eq.true,status.eq.connected")
    .ilike("phone_number", `%${NOTIFIER_PHONE_DIGITS}%`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sup?.server_url && sup?.instance_token) return sup;
  const { data: any_ } = await admin
    .from("whatsapp_instances")
    .select("server_url,instance_token,status,is_connected")
    .eq("tenant_id", tenantId)
    .or("is_connected.eq.true,status.eq.connected")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return any_;
}

const SUPERVISORS = [
  { name: "Ediane", phone: "554599874647" },
  { name: "Antonio", phone: "554891218235" },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function statusLabel(stage?: string | null, status?: string | null): string {
  const s = (stage || "").toLowerCase();
  const st = (status || "").toLowerCase();
  if (s === "comprou" || st === "won") return "Fechou negócio ✅";
  if (s === "perdido" || st === "lost") return "Não fechou ❌";
  if (s === "atendimento" || st === "in_progress") return "Em atendimento ⏳";
  if (s === "novo" || st === "new") return "Novo lead ✨";
  return stage || status || "—";
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
    const body = await req.json().catch(() => ({}));
    const { lead_id, note, outcome } = body ?? {};
    if (!lead_id) return json({ error: "lead_id required" }, 400);

    const { data: lead, error: leadErr } = await admin
      .from("leads").select("*").eq("id", lead_id).maybeSingle();
    if (leadErr || !lead) return json({ error: "lead not found" }, 404);

    const { data: profile } = await admin
      .from("profiles").select("full_name,email").eq("id", userRes.user.id).maybeSingle();
    const { data: tenant } = await admin
      .from("tenants").select("name").eq("id", lead.tenant_id).maybeSingle();

    const { data: sender } = await admin
      .from("whatsapp_instances")
      .select("server_url,instance_token,status,is_connected")
      .eq("tenant_id", lead.tenant_id)
      .or("is_connected.eq.true,status.eq.connected")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!sender?.server_url || !sender?.instance_token) {
      return json({ error: "no connected whatsapp instance" }, 400);
    }

    const lines = [
      `🔔 *Atualização de atendimento* — ${tenant?.name ?? ""}`,
      ``,
      `*Status:* ${statusLabel(lead.stage, lead.status)}${outcome ? ` (${outcome})` : ""}`,
      `*Lead:* ${lead.name || "(sem nome)"}`,
      lead.email ? `*Email:* ${lead.email}` : null,
      lead.interest ? `*Interesse:* ${lead.interest}` : null,
      lead.source ? `*Origem:* ${lead.source}` : null,
      ``,
      `*Vendedor:* ${profile?.full_name || profile?.email || "—"}`,
      `*Anotação:*`,
      note?.toString().trim() || lead.notes || "(sem anotação)",
      ``,
      `👉 Acesse o CRM para retomar o atendimento.`,
      ``,
      `_Encaminhe ou retome o atendimento se necessário._`,
    ].filter(Boolean).join("\n");

    const results = await Promise.all(
      SUPERVISORS.map(async (sup) => {
        try {
          await randomSendDelay();
          const r = await fetch(`${sender.server_url}/send/text`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: sender.instance_token! },
            body: JSON.stringify({ number: sup.phone, text: lines }),
          });
          const ok = r.ok;
          await admin.from("lead_notifications").insert({
            tenant_id: lead.tenant_id,
            lead_id: lead.id,
            type: "supervisor_note",
            recipient_phone: sup.phone,
            message_sent: lines,
            delivered: ok,
          });
          return { supervisor: sup.name, ok };
        } catch (e) {
          return { supervisor: sup.name, ok: false, error: String(e) };
        }
      })
    );

    return json({ ok: true, results });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
