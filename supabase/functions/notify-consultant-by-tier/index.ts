import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// === MODO ESTABILIDADE: delay aleatório antes de cada envio (remover quando voltar ao normal).
async function randomSendDelay(): Promise<void> {
  let ms = 5000 + Math.floor(Math.random() * 55000);
  if (Math.random() < 0.1) ms += 30000 + Math.floor(Math.random() * 60000);
  console.log("[stability] sleeping", ms, "ms before send");
  await new Promise((r) => setTimeout(r, ms));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function brl(n: number | null | undefined) {
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }).format(Number(n));
  } catch {
    return `R$ ${n}`;
  }
}

function normalizePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const d = p.replace(/\D/g, "");
  if (d.length < 10) return null;
  if (d.startsWith("55")) return d;
  return "55" + d;
}

function parseCreditFromInterest(raw: string | null | undefined): number | null {
  if (!raw) return null;
  // Normaliza: minúsculas, sem acentos, underscores viram espaço (planilha usa "r$_300_mil_-_r$_500_mil")
  const s = String(raw)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/_/g, " ");
  // Captura todos números com sufixos opcionais kk/mi/mil/k
  // Captura todos números com sufixos opcionais. ORDEM IMPORTA: mais específicos primeiro
  // (mil antes de mi, milhoes antes de milhao etc.) senão "800 mil" casa "800 mi" → x1.000.000.
  const re = /([\d]+(?:[.,]\d+)?)\s*(kk|mm|milhoes|milhao|milhões|milhão|milh|mil|mi|k)?\b/g;
  let m: RegExpExecArray | null;
  const values: number[] = [];
  while ((m = re.exec(s)) !== null) {
    const num = parseFloat(m[1].replace(",", "."));
    if (isNaN(num)) continue;
    const suf = (m[2] || "").trim();
    let v = num;
    // Match exato do sufixo (não usar .test que faz substring — "mil" contém "mi")
    if (suf === "kk" || suf === "mm" || suf === "mi" || suf === "milhao" || suf === "milhão"
        || suf === "milhoes" || suf === "milhões" || suf === "milh") v = num * 1_000_000;
    else if (suf === "mil" || suf === "k") v = num * 1_000;
    else if (num < 1000 && /\bmil\b/.test(s)) v = num * 1_000;
    if (v >= 1000) values.push(v);
  }
  if (!values.length) return null;
  // Usa o maior (limite superior da faixa)
  return Math.max(...values);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    const { lead_id, force } = body ?? {};
    if (!lead_id) return json({ error: "lead_id required" }, 400);

    const { data: lead, error: leadErr } = await admin
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .maybeSingle();
    if (leadErr || !lead) return json({ error: "lead not found" }, 404);
    // Contatos "outros" (não-leads de planilha/anúncio) não disparam notificação
    // nem ranking nem atribuição automática para consultor.
    if ((lead as { kind?: string }).kind === "outros") {
      return json({ ok: true, skipped: "lead kind is outros" });
    }


    // Fallback: extrai credit_value de interest se necessário
    let _creditValue: number | null = lead.credit_value;
    if (_creditValue == null) _creditValue = parseCreditFromInterest(lead.interest);

    // Se o lead JÁ está atribuído (trigger auto_assign_new_lead), apenas notifica
    // o consultor responsável — não re-atribui.
    if (lead.assigned_member_id || lead.assigned_to) {
      const assignedId = lead.assigned_member_id || lead.assigned_to;

      const { data: prevNotif } = await admin
        .from("lead_notifications")
        .select("id")
        .eq("lead_id", lead.id)
        .eq("type", "consultant_tier_match")
        .limit(1)
        .maybeSingle();
      if (prevNotif) return json({ ok: true, skipped: "already notified" });

      const { data: member } = await admin
        .from("tenant_members")
        .select("id, display_name, phone, role_label")
        .eq("id", assignedId)
        .maybeSingle();

      if (!member) return json({ ok: true, skipped: "assigned member not found" });
      const role = String(member.role_label || "").toLowerCase();
      const mname = String(member.display_name || "").toLowerCase();
      if (!role.includes("consultor") || role.includes("supervisor")
          || role.includes("aprendiz") || role.includes("dono") || mname.includes("teste")) {
        return json({ ok: true, skipped: "assigned member is not a consultant" });
      }
      const phone = normalizePhone(member.phone);
      if (!phone) return json({ ok: true, skipped: "assigned member has invalid phone" });

      const { data: existingConv } = await admin
        .from("conversations").select("id")
        .eq("tenant_id", lead.tenant_id).eq("lead_id", lead.id)
        .limit(1).maybeSingle();
      if (!existingConv) {
        await admin.from("conversations").insert({
          tenant_id: lead.tenant_id, lead_id: lead.id, channel: "whatsapp", status: "open",
        });
      }

      const { data: sender } = await admin
        .from("whatsapp_instances")
        .select("server_url,instance_token,status,is_connected")
        .eq("tenant_id", lead.tenant_id)
        .or("is_connected.eq.true,status.eq.connected")
        .order("created_at", { ascending: true }).limit(1).maybeSingle();

      const text = [
        `🟢 *Novo lead atribuído a você!*`, ``,
        `*Nome:* ${lead.name || "(sem nome)"}`,
        `*Valor da carta:* ${brl(_creditValue)}`,
        lead.asset_type ? `*Bem:* ${lead.asset_type}` : null,
        lead.interest ? `*Interesse:* ${lead.interest}` : null,
        lead.source ? `*Origem:* ${lead.source}` : null, ``,
        `🔒 Esse lead já está travado no seu nome — *ninguém mais consegue pegar*.`, ``,
        `👉 Acesse o CRM para retomar o atendimento.`, ``,
        `_Equipe FeraCon 🦁_`,
      ].filter(Boolean).join("\n");

      let delivered = false;
      if (sender?.server_url && sender?.instance_token) {
        try {
          await randomSendDelay();
          const r = await fetch(`${sender.server_url}/send/text`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: sender.instance_token! },
            body: JSON.stringify({ number: phone, text }),
          });
          delivered = r.ok;
        } catch (e) { console.error("whatsapp send error", e); }
      }

      await admin.from("lead_notifications").insert({
        tenant_id: lead.tenant_id, lead_id: lead.id,
        type: "consultant_tier_match",
        recipient_phone: phone, recipient_member_id: member.id,
        message_sent: text, delivered,
      });

      return json({ ok: true, notified_existing_assignee: { id: member.id, name: member.display_name, delivered } });
    }
    // Lead importado de planilha (base antiga) — não dispara rotação,
    // exceto quando force=true (backfill manual).
    if (lead.imported_from_sheet === true && !force) {
      return json({ ok: true, skipped: "imported from sheet" });
    }

    const creditValue: number | null = _creditValue;
    if (creditValue == null) {
      return json({ ok: true, skipped: "no credit_value" });
    }



    const { data: tierRow } = await admin
      .from("tenant_members")
      .select("max_credit_value")
      .eq("tenant_id", lead.tenant_id)
      .eq("is_active", true)
      .eq("receives_leads", true)
      .not("max_credit_value", "is", null)
      .gte("max_credit_value", creditValue)
      .order("max_credit_value", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!tierRow?.max_credit_value) {
      return json({ ok: true, skipped: "no tier covers this value" });
    }

    const { data: consultantsRaw } = await admin
      .from("tenant_members")
      .select("id, display_name, phone, max_credit_value, role_label, daily_lead_limit")
      .eq("tenant_id", lead.tenant_id)
      .eq("is_active", true)
      .eq("receives_leads", true)
      .eq("max_credit_value", tierRow.max_credit_value)
      .not("phone", "is", null);

    // Somente Consultores recebem leads. Exclui Vendedor, Supervisor, Dono,
    // Menor Aprendiz e contas com "teste" no nome.
    const baseConsultants = (consultantsRaw || []).filter((c: any) => {
      const role = String(c.role_label || "").toLowerCase();
      const name = String(c.display_name || "").toLowerCase();
      if (!role.includes("consultor")) return false;
      if (role.includes("supervisor") || role.includes("aprendiz") || role.includes("dono")) return false;
      if (name.includes("teste")) return false;
      return true;
    });

    // Aplica limite diário: descarta consultores que já bateram o teto de hoje.
    const sinceToday = new Date();
    sinceToday.setHours(0, 0, 0, 0);
    const baseIds = baseConsultants.map((c: any) => c.id);
    let todayCountByMember = new Map<string, number>();
    if (baseIds.length > 0) {
      const { data: todayRows } = await admin
        .from("leads")
        .select("assigned_member_id")
        .eq("tenant_id", lead.tenant_id)
        .eq("kind", "lead")
        .in("assigned_member_id", baseIds)
        .gte("assigned_member_at", sinceToday.toISOString());

      for (const r of todayRows || []) {
        const mid = (r as any).assigned_member_id as string | null;
        if (mid) todayCountByMember.set(mid, (todayCountByMember.get(mid) ?? 0) + 1);
      }
    }
    const consultants = baseConsultants.filter((c: any) => {
      const lim = c.daily_lead_limit as number | null;
      if (lim == null) return true;
      return (todayCountByMember.get(c.id) ?? 0) < lim;
    });

    if (!consultants || consultants.length === 0) {
      return json({ ok: true, skipped: "no consultants in tier" });
    }

    // ===== Round-robin: escolhe o consultor da faixa que recebeu lead há mais tempo =====
    // Para cada consultor da faixa, buscamos a última atribuição (assigned_member_at).
    // Quem nunca recebeu (null) ganha prioridade máxima. Empates vão por ordem alfabética
    // para resultado determinístico.
    const memberIds = consultants.map((c) => c.id);
    const { data: lastAssignRows } = await admin
      .from("leads")
      .select("assigned_member_id, assigned_member_at")
      .eq("tenant_id", lead.tenant_id)
      .eq("kind", "lead")
      .in("assigned_member_id", memberIds)
      .not("assigned_member_at", "is", null)
      .order("assigned_member_at", { ascending: false });


    const lastByMember = new Map<string, number>();
    for (const row of lastAssignRows || []) {
      const mid = (row as any).assigned_member_id as string;
      if (!lastByMember.has(mid)) {
        lastByMember.set(mid, new Date((row as any).assigned_member_at).getTime());
      }
    }

    // Prioridade: (1) quem recebeu MENOS leads hoje vai primeiro — garante
    // que ninguém fica zerado enquanto outros acumulam; (2) desempate pela
    // última atribuição mais antiga (round-robin clássico); (3) alfabético.
    const ranked = [...consultants].sort((a, b) => {
      const ca = todayCountByMember.get(a.id) ?? 0;
      const cb = todayCountByMember.get(b.id) ?? 0;
      if (ca !== cb) return ca - cb;
      const ta = lastByMember.get(a.id) ?? -1; // nunca recebeu => -1 (vai primeiro)
      const tb = lastByMember.get(b.id) ?? -1;
      if (ta !== tb) return ta - tb;
      return (a.display_name || "").localeCompare(b.display_name || "");
    });

    const chosen = ranked[0];
    const chosenPhone = normalizePhone(chosen.phone);
    if (!chosenPhone) {
      return json({ ok: true, skipped: "chosen consultant has invalid phone" });
    }

    // Atribui o lead ao escolhido (com guarda de concorrência: só se ainda estiver livre).
    const { data: assigned, error: assignErr } = await admin
      .from("leads")
      .update({
        assigned_member_id: chosen.id,
        assigned_member_at: new Date().toISOString(),
        stage: "atendimento",
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id)
      .is("assigned_member_id", null)
      .select("id")
      .maybeSingle();

    if (assignErr) {
      console.error("assign error", assignErr);
      return json({ error: assignErr.message }, 500);
    }
    if (!assigned) {
      return json({ ok: true, skipped: "lead was just assigned by someone else" });
    }

    // Garante que exista uma conversa para o lead — assim ela já aparece em
    // "Conversas" do consultor sem precisar clicar em "Assumir".
    const { data: existingConv } = await admin
      .from("conversations")
      .select("id")
      .eq("tenant_id", lead.tenant_id)
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!existingConv) {
      await admin.from("conversations").insert({
        tenant_id: lead.tenant_id,
        lead_id: lead.id,
        channel: "whatsapp",
        status: "open",
      });
    }

    const { data: sender } = await admin
      .from("whatsapp_instances")
      .select("server_url,instance_token,status,is_connected")
      .eq("tenant_id", lead.tenant_id)
      .or("is_connected.eq.true,status.eq.connected")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const text = [
      `🟢 *Novo lead atribuído a você!*`,
      ``,
      `*Nome:* ${lead.name || "(sem nome)"}`,
      `*Valor da carta:* ${brl(creditValue)}`,
      lead.asset_type ? `*Bem:* ${lead.asset_type}` : null,
      lead.interest ? `*Interesse:* ${lead.interest}` : null,
      lead.source ? `*Origem:* ${lead.source}` : null,
      ``,
      `🔒 Esse lead já está travado no seu nome — *ninguém mais consegue pegar*. Você não precisa correr.`,
      ``,
      `👉 Acesse o CRM para retomar o atendimento.`,
      ``,
      `🤖 A nossa IA vai iniciar o *pré-atendimento* automaticamente, aquecer o lead e levantar o interesse. Assim que ela concluir, ou se o lead ficar parado por muito tempo, você recebe um novo aviso pra entrar em ação.`,
      ``,
      `_Equipe FeraCon 🦁_`,
    ].filter(Boolean).join("\n");

    let delivered = false;
    if (sender?.server_url && sender?.instance_token) {
      try {
        await randomSendDelay();
        const r = await fetch(`${sender.server_url}/send/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: sender.instance_token! },
          body: JSON.stringify({ number: chosenPhone, text }),
        });
        delivered = r.ok;
      } catch (e) {
        console.error("whatsapp send error", e);
      }
    } else {
      console.warn("no connected whatsapp instance — lead assigned without notification");
    }

    await admin.from("lead_notifications").insert({
      tenant_id: lead.tenant_id,
      lead_id: lead.id,
      type: "consultant_tier_match",
      recipient_phone: chosenPhone,
      recipient_member_id: chosen.id,
      message_sent: text,
      delivered,
    });

    return json({
      ok: true,
      tier: tierRow.max_credit_value,
      assigned_to: { id: chosen.id, name: chosen.display_name, delivered },
    });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
