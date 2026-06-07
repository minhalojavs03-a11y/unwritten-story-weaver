import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TENANT_ID = "9ecb99e2-50ee-404f-920b-81cd94cc685e";
const NOTIFIER_PHONE_DIGITS = "4792352804";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normPhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const d = String(p).replace(/\D/g, "");
  if (d.length < 10) return null;
  return d.startsWith("55") ? d : "55" + d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const memberId: string | undefined = body?.member_id;
    const targetPhoneRaw: string | undefined = body?.phone;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Pick the official company sender instance (47 9235-2804)
    const { data: sender } = await admin
      .from("whatsapp_instances")
      .select("server_url, instance_token, phone_number, is_connected, status")
      .eq("tenant_id", TENANT_ID)
      .or("is_connected.eq.true,status.eq.connected")
      .ilike("phone_number", `%${NOTIFIER_PHONE_DIGITS}%`)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sender?.server_url || !sender?.instance_token) {
      return json({ error: "Company instance 4792352804 not connected" }, 400);
    }

    // Resolve recipient: by member_id, by phone, or default to first eligible consultant
    let recipientPhone: string | null = null;
    let recipientName = "Consultor";

    if (memberId) {
      const { data: m } = await admin
        .from("tenant_members")
        .select("display_name, phone, role_label")
        .eq("id", memberId)
        .maybeSingle();
      if (!m) return json({ error: "member not found" }, 404);
      recipientPhone = normPhone(m.phone);
      recipientName = m.display_name || "Consultor";
    } else if (targetPhoneRaw) {
      recipientPhone = normPhone(targetPhoneRaw);
    } else {
      const { data: c } = await admin
        .from("tenant_members")
        .select("display_name, phone")
        .eq("tenant_id", TENANT_ID)
        .eq("is_active", true)
        .eq("receives_leads", true)
        .ilike("role_label", "%consultor%")
        .not("role_label", "ilike", "%supervisor%")
        .not("phone", "is", null)
        .order("display_name")
        .limit(1)
        .maybeSingle();
      if (!c) return json({ error: "no consultant found" }, 404);
      recipientPhone = normPhone(c.phone);
      recipientName = c.display_name || "Consultor";
    }

    if (!recipientPhone) return json({ error: "invalid recipient phone" }, 400);

    const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const text = [
      `🧪 *TESTE — Disparo do número oficial Feracon*`,
      ``,
      `Olá ${recipientName}, esta é uma mensagem automática de teste.`,
      `Confirma que o número *47 9235-2804* está enviando avisos para consultores corretamente.`,
      ``,
      `⏰ ${now}`,
      `_Pode ignorar — não é um lead real._`,
    ].join("\n");

    const r = await fetch(`${sender.server_url.replace(/\/$/, "")}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: sender.instance_token },
      body: JSON.stringify({ number: recipientPhone, text }),
    });
    const raw = await r.text();
    if (!r.ok) {
      return json({ error: "send failed", status: r.status, detail: raw.slice(0, 400) }, 502);
    }

    return json({
      ok: true,
      sender_phone: sender.phone_number,
      recipient_phone: recipientPhone,
      recipient_name: recipientName,
      preview: text,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
