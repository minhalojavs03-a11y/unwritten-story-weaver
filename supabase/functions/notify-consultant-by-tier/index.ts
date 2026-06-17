import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Pequeno jitter humanizado antes do envio — o anterior chegava a 150s e fazia
// a edge function estourar o timeout antes de gravar os logs/notificações.
async function randomSendDelay(): Promise<void> {
  const ms = 1500 + Math.floor(Math.random() * 4500); // 1.5s–6s
  await new Promise((r) => setTimeout(r, ms));
}

// Único número autorizado a enviar avisos internos (supervisor / principal Feracon).
// "47 9235-2804" → dígitos com DDI: 554792352804.
const NOTIFIER_PHONE_DIGITS = "4792352804";

async function pickNotifierInstance(admin: any, tenantId: string) {
  const { data: sup } = await admin
    .from("whatsapp_instances")
    .select("server_url,instance_token,status,is_connected,phone_number")
    .eq("tenant_id", tenantId)
    .or("is_connected.eq.true,status.eq.connected")
    .ilike("phone_number", `%${NOTIFIER_PHONE_DIGITS}%`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sup?.server_url && sup?.instance_token) return sup;
  // Fallback: se o número principal estiver fora do ar, evita blackout total.
  const { data: any_ } = await admin
    .from("whatsapp_instances")
    .select("server_url,instance_token,status,is_connected,phone_number")
    .eq("tenant_id", tenantId)
    .or("is_connected.eq.true,status.eq.connected")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return any_;
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

function buildLeadNotice(lead: any, creditValue: number | null): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const category = lead.asset_type || lead.opportunity_type || lead.interest || "Consórcio";
  const phone = lead.phone || lead.whatsapp || lead.phone_number || "";
  return [
    `🔔 *Novo lead atribuído a você!*`,
    ``,
    `👤 *Nome:* ${lead.name || "(sem nome)"}`,
    `📞 *Número:* ${phone || "(não informado)"}`,
    `💰 *Carta contemplada:* ${brl(creditValue)}`,
    `📋 *Tipo:* ${category}`,
    `📅 *Recebido em:* ${dd}/${mm}/${yyyy} às ${hh}:${mi}`,
    ``,
    `Acesse o sistema para iniciar o atendimento.`,
  ].join("\n");
}

// ===== In-app notification fan-out =====
async function fanoutAppNotifications(admin: any, params: {
  tenantId: string;
  leadId: string;
  leadName: string;
  creditValue: number | null;
  consultantMemberId: string;
  consultantName: string;
  consultantEmail: string | null;
  consultantNotifyInapp: boolean;
}) {
  try {
    const { tenantId, leadId, leadName, creditValue, consultantMemberId,
      consultantName, consultantEmail, consultantNotifyInapp } = params;
    const valueLabel = brl(creditValue);
    const rows: any[] = [];

    if (consultantNotifyInapp && consultantEmail) {
      const { data: prof } = await admin
        .from("profiles").select("id").eq("email", consultantEmail).maybeSingle();
      if (prof?.id) {
        rows.push({
          tenant_id: tenantId, recipient_user_id: prof.id,
          type: "new_lead",
          title: "Novo lead atribuído",
          body: `👤 ${leadName} · 💰 ${valueLabel}`,
          lead_id: leadId,
          metadata: { consultant_member_id: consultantMemberId },
        });
      }
    }

    const { data: owners } = await admin
      .from("tenant_memberships").select("user_id")
      .eq("tenant_id", tenantId).eq("role", "owner");
    for (const o of owners || []) {
      if (!o.user_id) continue;
      rows.push({
        tenant_id: tenantId, recipient_user_id: o.user_id,
        type: "lead_distributed",
        title: "Lead distribuído",
        body: `👤 ${leadName} · 💰 ${valueLabel} → ${consultantName}`,
        lead_id: leadId,
        metadata: { consultant_member_id: consultantMemberId, consultant_name: consultantName },
      });
    }

    const { data: tenant } = await admin
      .from("tenants").select("name").eq("id", tenantId).maybeSingle();
    const tenantName = tenant?.name || "Tenant";
    const { data: supers } = await admin
      .from("user_roles").select("user_id").eq("role", "superadmin");
    for (const s of supers || []) {
      if (!s.user_id) continue;
      rows.push({
        tenant_id: tenantId, recipient_user_id: s.user_id,
        type: "lead_distributed",
        title: "Lead distribuído",
        body: `👤 ${leadName} · 💰 ${valueLabel} → ${consultantName} (${tenantName})`,
        lead_id: leadId,
        metadata: { consultant_member_id: consultantMemberId, consultant_name: consultantName, tenant_name: tenantName },
      });
    }

    const seen = new Set<string>();
    const unique = rows.filter((r) => {
      if (seen.has(r.recipient_user_id)) return false;
      seen.add(r.recipient_user_id);
      return true;
    });

    if (unique.length > 0) {
      const { error } = await admin.from("app_notifications").insert(unique);
      if (error) console.error("app_notifications insert error", error);
    }
  } catch (e) {
    console.error("fanoutAppNotifications error", e);
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

    // Se o lead JÁ está atribuído a um consultor real (assigned_member_id é
    // o id em tenant_members). Ignoramos `assigned_to` aqui porque o
    // sheets-sync usa esse campo como fallback com o user_id do dono — não
    // significa que um consultor já foi escolhido.
    if (lead.assigned_member_id) {
      const assignedId = lead.assigned_member_id;


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
        .select("id, display_name, phone, role_label, email, notify_inapp, notify_whatsapp")
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

      const { data: existingConv } = await admin
        .from("conversations").select("id")
        .eq("tenant_id", lead.tenant_id).eq("lead_id", lead.id)
        .limit(1).maybeSingle();
      if (!existingConv) {
        await admin.from("conversations").insert({
          tenant_id: lead.tenant_id, lead_id: lead.id, channel: "whatsapp", status: "open",
        });
      }

      // ===== In-app fan-out =====
      await fanoutAppNotifications(admin, {
        tenantId: lead.tenant_id,
        leadId: lead.id,
        leadName: lead.name || "(sem nome)",
        creditValue: _creditValue,
        consultantMemberId: member.id,
        consultantName: member.display_name || "Consultor",
        consultantEmail: member.email,
        consultantNotifyInapp: member.notify_inapp !== false,
      });

      // ===== WhatsApp (se permitido e telefone válido) =====
      const text = buildLeadNotice(lead, _creditValue);
      let delivered = false;
      let waStatus: "sent" | "failed" | "skipped" = "skipped";
      let waError: string | null = null;

      if (member.notify_whatsapp === false) {
        waStatus = "skipped";
        waError = "consultant has notify_whatsapp disabled";
      } else if (!phone) {
        waStatus = "failed";
        waError = "invalid phone";
      } else {
        const sender = await pickNotifierInstance(admin, lead.tenant_id);
        if (sender?.server_url && sender?.instance_token) {
          try {
            await randomSendDelay();
            const r = await fetch(`${sender.server_url}/send/text`, {
              method: "POST",
              headers: { "Content-Type": "application/json", token: sender.instance_token! },
              body: JSON.stringify({ number: phone, text }),
            });
            delivered = r.ok;
            waStatus = r.ok ? "sent" : "failed";
            if (!r.ok) waError = `http ${r.status}`;
          } catch (e) {
            console.error("whatsapp send error", e);
            waStatus = "failed";
            waError = String(e);
          }
        } else {
          waStatus = "failed";
          waError = "no connected whatsapp instance";
        }
      }

      await admin.from("lead_notifications").insert({
        tenant_id: lead.tenant_id, lead_id: lead.id,
        type: "consultant_tier_match",
        recipient_phone: phone, recipient_member_id: member.id,
        message_sent: text, delivered,
      });
      await admin.from("whatsapp_notification_log").insert({
        tenant_id: lead.tenant_id, consultant_member_id: member.id, lead_id: lead.id,
        status: waStatus, error_message: waError,
      });

      return json({ ok: true, notified_existing_assignee: { id: member.id, name: member.display_name, delivered, wa_status: waStatus } });
    }
    // Leads importados de planilha entram normalmente na rotação por faixa,
    // mas marcamos para pular o envio de WhatsApp (apenas atribui no painel).
    const skipWhatsappForImported = lead.imported_from_sheet === true && !force;

    const creditValue: number | null = _creditValue;
    if (creditValue == null) {
      return json({ ok: true, skipped: "no credit_value" });
    }



    // Busca todos os consultores que cobrem a faixa do lead.
    // Regra: (min IS NULL OR creditValue >= min) AND (max IS NULL OR creditValue <= max).
    const { data: consultantsRaw } = await admin
      .from("tenant_members")
      .select("id, display_name, phone, min_credit_value, max_credit_value, role_label, daily_lead_limit, email, notify_inapp, notify_whatsapp")
      .eq("tenant_id", lead.tenant_id)
      .eq("is_active", true)
      .eq("receives_leads", true)
      .not("phone", "is", null)
      .or(`min_credit_value.is.null,min_credit_value.lte.${creditValue}`)
      .or(`max_credit_value.is.null,max_credit_value.gte.${creditValue}`);

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
    // "Hoje" = dia corrente no fuso America/Sao_Paulo (00:00 SP), não UTC.
    const nowSp = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const spMidnightLocal = new Date(nowSp.getFullYear(), nowSp.getMonth(), nowSp.getDate(), 0, 0, 0, 0);
    // Converte a meia-noite SP de volta para UTC: SP = UTC-3 (sem horário de verão).
    const sinceToday = new Date(spMidnightLocal.getTime() + 3 * 60 * 60 * 1000);
    const baseIds = baseConsultants.map((c: any) => c.id);
    let todayCountByMember = new Map<string, number>();
    let lastTodayByMember = new Map<string, number>();
    if (baseIds.length > 0) {
      const { data: todayRows } = await admin
        .from("leads")
        .select("assigned_member_id, assigned_member_at")
        .eq("tenant_id", lead.tenant_id)
        .eq("kind", "lead")
        .in("assigned_member_id", baseIds)
        .gte("assigned_member_at", sinceToday.toISOString());

      for (const r of todayRows || []) {
        const mid = (r as any).assigned_member_id as string | null;
        if (!mid) continue;
        todayCountByMember.set(mid, (todayCountByMember.get(mid) ?? 0) + 1);
        const t = new Date((r as any).assigned_member_at).getTime();
        const prev = lastTodayByMember.get(mid) ?? 0;
        if (t > prev) lastTodayByMember.set(mid, t);
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

    // ===== Round-robin estritamente igualitário =====
    // Prioridade:
    //  (1) menor número de leads recebidos HOJE (janela SP);
    //  (2) entre quem ainda não recebeu hoje: ordem alfabética determinística
    //      (NÃO usamos histórico antigo — isso penalizava consultores que
    //      receberam leads tarde no dia anterior);
    //  (3) entre quem já recebeu hoje: quem recebeu há mais tempo HOJE primeiro;
    //  (4) alfabético como desempate final.
    const ranked = [...consultants].sort((a, b) => {
      const ca = todayCountByMember.get(a.id) ?? 0;
      const cb = todayCountByMember.get(b.id) ?? 0;
      if (ca !== cb) return ca - cb;
      const ta = lastTodayByMember.get(a.id);
      const tb = lastTodayByMember.get(b.id);
      // ambos sem atribuição hoje => alfabético
      if (ta == null && tb == null) return (a.display_name || "").localeCompare(b.display_name || "");
      if (ta == null) return -1; // quem não recebeu hoje vem primeiro
      if (tb == null) return 1;
      if (ta !== tb) return ta - tb; // mais antigo hoje primeiro
      return (a.display_name || "").localeCompare(b.display_name || "");
    });


    const chosen = ranked[0];
    const chosenPhone = normalizePhone(chosen.phone);

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

    // ===== In-app fan-out =====
    await fanoutAppNotifications(admin, {
      tenantId: lead.tenant_id,
      leadId: lead.id,
      leadName: lead.name || "(sem nome)",
      creditValue,
      consultantMemberId: chosen.id,
      consultantName: chosen.display_name || "Consultor",
      consultantEmail: chosen.email,
      consultantNotifyInapp: chosen.notify_inapp !== false,
    });

    // ===== WhatsApp =====
    const text = buildLeadNotice(lead, creditValue);
    let delivered = false;
    let waStatus: "sent" | "failed" | "skipped" = "skipped";
    let waError: string | null = null;

    if (skipWhatsappForImported) {
      waStatus = "skipped";
      waError = "imported_from_sheet: whatsapp suppressed";
    } else if (chosen.notify_whatsapp === false) {
      waStatus = "skipped";
      waError = "consultant has notify_whatsapp disabled";
    } else if (!chosenPhone) {
      waStatus = "failed";
      waError = "invalid phone";
    } else {
      const sender = await pickNotifierInstance(admin, lead.tenant_id);
      if (sender?.server_url && sender?.instance_token) {
        try {
          await randomSendDelay();
          const r = await fetch(`${sender.server_url}/send/text`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: sender.instance_token! },
            body: JSON.stringify({ number: chosenPhone, text }),
          });
          delivered = r.ok;
          waStatus = r.ok ? "sent" : "failed";
          if (!r.ok) waError = `http ${r.status}`;
        } catch (e) {
          console.error("whatsapp send error", e);
          waStatus = "failed";
          waError = String(e);
        }
      } else {
        waStatus = "failed";
        waError = "no connected whatsapp instance";
      }
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
    await admin.from("whatsapp_notification_log").insert({
      tenant_id: lead.tenant_id, consultant_member_id: chosen.id, lead_id: lead.id,
      status: waStatus, error_message: waError,
    });

    return json({
      ok: true,
      credit_value: creditValue,
      assigned_to: { id: chosen.id, name: chosen.display_name, delivered, wa_status: waStatus },
    });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
