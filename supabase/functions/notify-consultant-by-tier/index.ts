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

// Consultor Arley Davies (domdaviesdev): número exclusivo dos leads dele —
// nunca usar como remetente de avisos/fallback de outros consultores.
const DAVIES_USER_ID = "9a75e927-4b9b-4666-a0e4-3fd5ae4ee38a";

// Consultores marcados em `tenant_members.receive_leads_when_offline = true` continuam
// entrando na rotação mesmo com o WhatsApp deles desconectado — recebem o aviso pelo
// número 804 e pela notificação no sistema. Este set é preenchido em runtime a partir
// do banco (config por consultor na página de Distribuição de Leads).


// REGRA FIXA: avisos internos SÓ podem sair do número 804. Nunca usar outra
// instância conectada como remetente. Se o 804 estiver fora, enfileira e avisa
// no painel (Antonio supervisor, Ediane dona e superadmins).
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
  return null;
}

// Avisa no painel (in-app) supervisores, donos e superadmins quando o 804 falha.
async function alertNotifierFailure(admin: any, params: {
  tenantId: string;
  leadId: string | null;
  phone: string;
  reason: string | null;
  queued: boolean;
}) {
  try {
    const { tenantId, leadId, phone, reason, queued } = params;
    const recipients = new Set<string>();

    const { data: staff } = await admin
      .from("tenant_memberships").select("user_id, role")
      .eq("tenant_id", tenantId).in("role", ["owner", "supervisor", "admin"]);
    for (const s of staff || []) if (s.user_id) recipients.add(s.user_id);

    const { data: supers } = await admin
      .from("user_roles").select("user_id").eq("role", "superadmin");
    for (const s of supers || []) if (s.user_id) recipients.add(s.user_id);

    if (recipients.size === 0) return;

    const rows = [...recipients].map((uid) => ({
      tenant_id: tenantId,
      recipient_user_id: uid,
      type: "notifier_failure",
      title: "Aviso do número 804 não enviado",
      body: `Não foi possível enviar o aviso pelo número 804 para ${phone}. ${
        queued ? "O envio ficou na fila para nova tentativa." : "O envio falhou."
      }${reason ? ` (${reason})` : ""}`,
      lead_id: leadId,
      metadata: { phone, reason, queued },
    }));

    const { error } = await admin.from("app_notifications").insert(rows);
    if (error) console.error("notifier_failure insert error", error);
  } catch (e) {
    console.error("alertNotifierFailure error", e);
  }
}

// Envia SOMENTE pelo 804, com retry e backoff progressivo (erros 5xx/429/rede
// da uazapi são pontuais). Se ainda assim falhar, enfileira para o cron e
// dispara aviso no painel. Nunca usa outra instância como remetente.
const NOTIFIER_RETRY_DELAYS_MS = [0, 3000, 8000, 20000, 45000];

async function sendNotifierText(
  admin: any,
  tenantId: string,
  phone: string,
  text: string,
  leadId: string | null,
): Promise<{ delivered: boolean; status: "sent" | "failed" | "queued"; error: string | null }> {
  const inst = await pickNotifierInstance(admin, tenantId);
  let lastError: string | null = inst ? null : "notifier 804 instance unavailable";

  if (inst) {
    for (let attempt = 0; attempt < NOTIFIER_RETRY_DELAYS_MS.length; attempt++) {
      try {
        if (attempt === 0) await randomSendDelay();
        else await new Promise((r) => setTimeout(r, NOTIFIER_RETRY_DELAYS_MS[attempt]));
        const r = await fetch(`${String(inst.server_url).replace(/\/$/, "")}/send/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: inst.instance_token },
          body: JSON.stringify({ number: phone, text, message: text }),
        });
        if (r.ok) {
          if (attempt > 0) console.log(`[804] enviado após ${attempt + 1} tentativas`, phone);
          return { delivered: true, status: "sent", error: null };
        }
        lastError = `http ${r.status}`;
        // 4xx (exceto 429) é erro de payload/credencial: repetir não resolve.
        if (r.status >= 400 && r.status < 500 && r.status !== 429) break;
        console.warn(`[804] tentativa ${attempt + 1} falhou (${lastError}) — retry`, phone);
      } catch (e) {
        lastError = String(e);
        console.warn(`[804] tentativa ${attempt + 1} com erro de rede — retry`, lastError);
      }
    }
  }


  // Nunca cai para outra instância: enfileira e avisa no painel.
  try {
    await admin.from("notification_queue").insert({
      tenant_id: tenantId,
      lead_id: leadId,
      type: "announcement",
      recipient_phone: phone,
      message_text: text,
      due_at: new Date(Date.now() + 60_000).toISOString(),
    });
    await alertNotifierFailure(admin, {
      tenantId, leadId, phone, reason: lastError, queued: true,
    });
    return { delivered: false, status: "queued", error: lastError };
  } catch (e) {
    await alertNotifierFailure(admin, {
      tenantId, leadId, phone, reason: `${lastError} / queue: ${String(e)}`, queued: false,
    });
    return { delivered: false, status: "failed", error: `${lastError} / queue: ${String(e)}` };
  }
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
      let waStatus: "sent" | "failed" | "skipped" | "queued" = "skipped";
      let waError: string | null = null;

      if (member.notify_whatsapp === false) {
        waStatus = "skipped";
        waError = "consultant has notify_whatsapp disabled";
      } else if (!phone) {
        waStatus = "failed";
        waError = "invalid phone";
      } else {
        const res = await sendNotifierText(admin, lead.tenant_id, phone, text, lead.id);
        delivered = res.delivered;
        waStatus = res.status;
        waError = res.error;
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

      // Dispara boas-vindas também no caminho "consultor já pré-atribuído"
      // (ex.: lead veio da planilha já com dono). Sem isso a saudação da
      // Embracon nunca era enviada para esses leads.
      try {
        await admin.functions.invoke("send-lead-welcome", { body: { lead_id: lead.id } });
      } catch (e) {
        console.error("send-lead-welcome invoke failed (existing-assignee path)", e);
      }

      return json({ ok: true, notified_existing_assignee: { id: member.id, name: member.display_name, delivered, wa_status: waStatus } });
    }
    // Notificação por WhatsApp é enviada também para leads importados de planilha
    // (consultor precisa saber que recebeu um novo lead, independente da origem).
    const skipWhatsappForImported = false;


    // Se não conseguimos identificar a faixa do crédito, NÃO travar o lead.
    // Tratamos como faixa mínima (0) para que qualquer consultor habilitado pegue.
    const creditValue: number = _creditValue ?? 0;





    // Determina o filtro de origem (Leads 01 = receives_leads, Leads 02 = receives_leads_02).
    // Lê metadata.sheet_source_label gravado pelo sheets-sync.
    const sheetSourceLabel: string | null =
      (lead?.metadata && typeof lead.metadata === "object" && (lead.metadata as any).sheet_source_label) || null;
    const isLeads02 = sheetSourceLabel === "Leads 02";
    const sourceColumn = isLeads02 ? "receives_leads_02" : "receives_leads";

    // Busca todos os consultores ativos que recebem essa origem. A faixa de crédito
    // é preferência, não bloqueio: se ninguém bater a faixa, caímos para a rotação
    // da origem para nunca deixar lead travado sem consultor.
    const { data: consultantsRaw } = await admin
      .from("tenant_members")
      .select("id, user_id, display_name, phone, min_credit_value, max_credit_value, role_label, daily_lead_limit, email, notify_inapp, notify_whatsapp, receive_leads_when_offline")
      .eq("tenant_id", lead.tenant_id)
      .eq("is_active", true)
      .eq(sourceColumn, true)
      .not("phone", "is", null);

    // Filtra por faixa de crédito (min/max) — null = sem limite no lado correspondente.
    const inTier = (consultantsRaw || []).filter((c: any) => {
      const minOk = c.min_credit_value == null || Number(c.min_credit_value) <= creditValue;
      const maxOk = c.max_credit_value == null || Number(c.max_credit_value) >= creditValue;
      return minOk && maxOk;
    });

    // Somente Consultores recebem leads. Exclui Vendedor, Supervisor, Dono,
    // Menor Aprendiz e contas com "teste" no nome.
    const eligibleByOrigin = (consultantsRaw || []).filter((c: any) => {
      const role = String(c.role_label || "").toLowerCase();
      const name = String(c.display_name || "").toLowerCase();
      if (!role.includes("consultor")) return false;
      if (role.includes("supervisor") || role.includes("aprendiz") || role.includes("dono")) return false;
      if (name.includes("teste")) return false;
      return true;
    });
    let baseConsultants = inTier.filter((c: any) => eligibleByOrigin.some((e: any) => e.id === c.id));
    let fallbackUsedOutOfTier = false;
    if (baseConsultants.length === 0 && eligibleByOrigin.length > 0) {
      baseConsultants = eligibleByOrigin;
      fallbackUsedOutOfTier = true;
      console.log("[notify-tier] no consultant in credit tier — falling back to source rotation", {
        lead_id: lead.id,
        sheet_source_label: sheetSourceLabel,
        credit_value: creditValue,
      });
    }

    // Regra padrão: consultor sem WhatsApp conectado não entra na rotação.
    // Exceção explícita da operação: Renata continua recebendo leads/avisos
    // mesmo offline, via número 804 e notificação no sistema.
    const userIds = baseConsultants.map((c: any) => c.user_id).filter(Boolean);
    const connectedUserIds = new Set<string>();
    if (userIds.length > 0) {
      const { data: insts } = await admin
        .from("whatsapp_instances")
        .select("seller_user_id,is_connected,status")
        .eq("tenant_id", lead.tenant_id)
        .in("seller_user_id", userIds)
        .or("is_connected.eq.true,status.eq.connected");
      for (const i of insts || []) {
        if ((i as any).seller_user_id) connectedUserIds.add((i as any).seller_user_id);
      }
    }
    const onlineConsultants = baseConsultants.filter((c: any) => {
      if (!c.user_id) return false;
      if (c.receive_leads_when_offline === true) return true;
      return connectedUserIds.has(c.user_id);
    });
    // REGRA DO DONO: nunca deixar lead "sem consultor atribuído".
    // WhatsApp desconectado NÃO impede a atribuição — se ninguém estiver
    // conectado, distribui mesmo assim (aviso sai pelo número da empresa).
    const fallbackUsedOffline = onlineConsultants.length === 0;
    const connectedConsultants = fallbackUsedOffline ? baseConsultants : onlineConsultants;


    



    // Aplica limite diário: descarta consultores que já bateram o teto de hoje.
    // "Hoje" = dia corrente no fuso America/Sao_Paulo (00:00 SP), não UTC.
    const nowSp = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const spMidnightLocal = new Date(nowSp.getFullYear(), nowSp.getMonth(), nowSp.getDate(), 0, 0, 0, 0);
    // Converte a meia-noite SP de volta para UTC: SP = UTC-3 (sem horário de verão).
    const sinceToday = new Date(spMidnightLocal.getTime() + 3 * 60 * 60 * 1000);
    const baseIds = connectedConsultants.map((c: any) => c.id);
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
    // ===== Cota diária como TETO RÍGIDO =====
    // Regra do dono: se você configurou 5, são exatamente 5 — nem mais, nem menos.
    // O excedente é distribuído para quem ainda está abaixo da cota. Se TODOS
    // já bateram, o lead fica sem atribuir e é retentado depois (novo dia /
    // reprocesso manual). Consultor sem cota definida (null) é tratado como 1.
    const consultants = connectedConsultants;
    if (!consultants || consultants.length === 0) {
      return json({ ok: true, skipped: "no consultants in tier" });
    }

    const underCota = consultants.filter((c: any) => {
      const cnt = todayCountByMember.get(c.id) ?? 0;
      const lim = (c.daily_lead_limit as number | null) ?? 1;
      return cnt < lim;
    });

    // Se TODOS já bateram a cota, ainda assim atribuímos (nunca deixar lead
    // sem consultor) — o excedente vai para quem tem MENOS leads hoje.
    const poolAcimaDaCota = underCota.length === 0;
    if (poolAcimaDaCota) {
      console.log("[notify-tier] all consultants at cap — overflow to least loaded", {
        lead_id: lead.id,
        counts: Object.fromEntries(todayCountByMember),
      });
    }

    // ===== Prioridade operacional: Micaelly, Nilton e David primeiro =====
    // Enquanto qualquer um deles ainda estiver abaixo da cota diária, TODOS os
    // leads novos vão para eles. Os demais consultores só entram na rotação
    // depois que o grupo prioritário bater o teto configurado.
    // Diéssica é DESPRIORIZADA: só recebe quando ninguém mais estiver abaixo da cota.
    const PRIORITY_NAMES = ["micaelly", "nilton", "david"];
    const DEPRIORITY_NAMES = ["diessica"];
    const normName = (c: any) =>
      String(c.display_name || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    const isPriority = (c: any) => PRIORITY_NAMES.some((p) => normName(c).includes(p));
    const isDeprioritized = (c: any) => DEPRIORITY_NAMES.some((p) => normName(c).includes(p));
    const base = poolAcimaDaCota ? consultants : underCota;
    const priorityUnderCota = base.filter(isPriority);
    const regularUnderCota = base.filter((c) => !isPriority(c) && !isDeprioritized(c));
    const pool =
      priorityUnderCota.length > 0
        ? priorityUnderCota
        : regularUnderCota.length > 0
          ? regularUnderCota
          : base;



    // Ranking: quem tem MENOS leads absolutos hoje vem primeiro (nivelar antes
    // de encher). Empate: quem tem cota maior leva. Depois: quem recebeu por
    // último mais cedo.
    const ranked = [...pool].sort((a, b) => {
      const ca = todayCountByMember.get(a.id) ?? 0;
      const cb = todayCountByMember.get(b.id) ?? 0;
      const la = (a.daily_lead_limit as number | null) ?? 1;
      const lb = (b.daily_lead_limit as number | null) ?? 1;
      if (ca !== cb) return ca - cb;
      const ra = ca / Math.max(la, 1);
      const rb = cb / Math.max(lb, 1);
      if (ra !== rb) return ra - rb;
      if (la !== lb) return lb - la;
      const ta = lastTodayByMember.get(a.id);
      const tb = lastTodayByMember.get(b.id);
      if (ta == null && tb == null) return (a.display_name || "").localeCompare(b.display_name || "");
      if (ta == null) return -1;
      if (tb == null) return 1;
      if (ta !== tb) return ta - tb;
      return (a.display_name || "").localeCompare(b.display_name || "");
    });


    // ===== Recontagem atômica =====
    // Entre a contagem inicial e este ponto outra execução pode ter atribuído
    // leads. Recontamos e escolhemos o primeiro do ranking ainda abaixo da cota.
    // Se todos estiverem no teto, mantemos o primeiro do ranking (nunca deixar
    // o lead sem consultor atribuído).
    let chosen = ranked[0];
    if (!poolAcimaDaCota) {
      for (const cand of ranked) {
        const lim = (cand.daily_lead_limit as number | null) ?? 1;
        const { count: freshCount } = await admin
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", lead.tenant_id)
          .eq("kind", "lead")
          .eq("assigned_member_id", cand.id)
          .gte("assigned_member_at", sinceToday.toISOString());
        if ((freshCount ?? 0) < lim) { chosen = cand; break; }
      }
    }
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
    let waStatus: "sent" | "failed" | "skipped" | "queued" = "skipped";
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
      const res = await sendNotifierText(admin, lead.tenant_id, chosenPhone, text, lead.id);
      delivered = res.delivered;
      waStatus = res.status;
      waError = res.error;
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

    // Dispara a saudação da Embracon AGORA que o consultor já foi atribuído —
    // `send-lead-welcome` usa `pickConsultantInstance` e envia pela instância
    // do próprio consultor (cai no 804 só se ele estiver offline).
    try {
      await admin.functions.invoke("send-lead-welcome", { body: { lead_id: lead.id } });
    } catch (e) {
      console.error("send-lead-welcome invoke failed", e);
    }

    return json({
      ok: true,
      credit_value: creditValue,
      fallback_used_out_of_tier: fallbackUsedOutOfTier,
      fallback_used_offline: fallbackUsedOffline,
      assigned_to: { id: chosen.id, name: chosen.display_name, delivered, wa_status: waStatus },
    });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
