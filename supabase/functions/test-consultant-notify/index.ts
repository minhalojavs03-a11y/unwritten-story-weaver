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
    const all: boolean = body?.all === true;

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

    async function sendOne(name: string, phoneRaw: string | null) {
      const phone = normPhone(phoneRaw);
      if (!phone) return { name, phone: phoneRaw, ok: false, error: "invalid phone" };
      const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      const text = [
        `🧪 *TESTE — Disparo do número oficial Feracon*`,
        ``,
        `Olá ${name}, esta é uma mensagem automática de teste.`,
        `Confirma que o número *47 9235-2804* está enviando avisos para consultores corretamente.`,
        ``,
        `⏰ ${now}`,
        `_Pode ignorar — não é um lead real._`,
      ].join("\n");
      try {
        const r = await fetch(`${sender.server_url.replace(/\/$/, "")}/send/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: sender.instance_token },
          body: JSON.stringify({ number: phone, text }),
        });
        const raw = await r.text();
        return r.ok
          ? { name, phone, ok: true }
          : { name, phone, ok: false, status: r.status, error: raw.slice(0, 200) };
      } catch (e) {
        return { name, phone, ok: false, error: String(e) };
      }
    }

    if (all) {
      const { data: consultants } = await admin
        .from("tenant_members")
        .select("id, display_name, phone, role_label, notify_whatsapp")
        .eq("tenant_id", TENANT_ID)
        .eq("is_active", true)
        .eq("receives_leads", true)
        .eq("notify_whatsapp", true)
        .ilike("role_label", "%consultor%")
        .not("phone", "is", null)
        .order("display_name");

      const eligible = (consultants || []).filter((c: any) => {
        const role = String(c.role_label || "").toLowerCase();
        const nm = String(c.display_name || "").toLowerCase();
        return !role.includes("supervisor") && !role.includes("aprendiz")
          && !role.includes("dono") && !nm.includes("teste");
      });

      const results: any[] = [];
      for (let i = 0; i < eligible.length; i++) {
        const c = eligible[i];
        if (i > 0) {
          // Anti-ban delay 4–10s entre envios
          const ms = 4000 + Math.floor(Math.random() * 6000);
          await new Promise((r) => setTimeout(r, ms));
        }
        results.push(await sendOne(c.display_name || "Consultor", c.phone));
      }
      return json({ ok: true, sender_phone: sender.phone_number, count: results.length, results });
    }

    let recipientPhone: string | null = null;
    let recipientName = "Consultor";

    if (memberId) {
      const { data: m } = await admin
        .from("tenant_members")
        .select("display_name, phone")
        .eq("id", memberId)
        .maybeSingle();
      if (!m) return json({ error: "member not found" }, 404);
      recipientPhone = normPhone(m.phone);
      recipientName = m.display_name || "Consultor";
    } else if (targetPhoneRaw) {
      recipientPhone = normPhone(targetPhoneRaw);
    } else {
      return json({ error: "provide member_id, phone, or all=true" }, 400);
    }

    if (!recipientPhone) return json({ error: "invalid recipient phone" }, 400);
    const result = await sendOne(recipientName, recipientPhone);
    if (!result.ok) return json({ error: "send failed", ...result }, 502);
    return json({ ok: true, sender_phone: sender.phone_number, ...result });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
