// Follow-up automático de reativação de leads PERDIDOS.
//
// Regras da operação:
// - Máximo de 2 leads por consultor por dia.
// - Envio SEMPRE pelo número (instância uazapi) do próprio consultor dono do lead.
// - Um envio por consultor a cada execução; o cron roda a cada 15 min, o que
//   garante o intervalo mínimo de 15 minutos entre disparos da mesma instância.
// - Fila dos mais ANTIGOS para os mais novos (do final dos perdidos para os atuais).
// - Não é aleatório: os leads são pontuados por probabilidade de retomada e só
//   entram na fila os que passam do score mínimo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const NOTIF_TYPE = "reactivation";
const DAILY_LIMIT_PER_CONSULTANT = 5;
const MIN_SCORE = 3;
const MIN_DAYS_SINCE_LAST_CONTACT = 7;   // não reabordar leads mexidos há poucos dias
const REACTIVATION_COOLDOWN_DAYS = 60;   // não repetir reativação no mesmo lead

// IDs de membros que NÃO devem participar da reativação automática (ex.: supervisores).
const SKIP_MEMBER_IDS = new Set([
  "a1f959f9-8318-42c6-a843-6804fddef7c0", // Antonio Junior
]);

// Motivos de perda que eliminam qualquer chance real de retomada.
const HARD_LOSS_PATTERNS = [
  /n(ã|a)o\s*(é|e)\s*o?\s*titular/i,
  /n(ú|u)mero\s*(errado|inv(á|a)lido)/i,
  /telefone\s*(errado|inv(á|a)lido)/i,
  /duplicad/i,
  /trote/i,
  /golpe/i,
  /faleceu|(ó|o)bito/i,
  /j(á|a)\s*(comprou|fechou|contratou)\s*(com|em)?\s*(outra|concorrente)?/i,
  /pediu\s*para\s*n(ã|a)o\s*(entrar\s*em\s*contato|ligar|chamar)/i,
  /descadastr|bloqueou|spam/i,
  /menor\s*de\s*idade/i,
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function brl(n: number) {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
  } catch { return `R$ ${n}`; }
}

// Hora local de São Paulo (UTC-3) para escolher "Bom dia" / "Boa tarde".
function saoPauloHour(): number {
  const s = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false,
  }).format(new Date());
  return Number(s.replace(/\D/g, "")) || 0;
}

function firstName(name: string | null): string {
  const n = (name || "").trim().split(/\s+/)[0] || "";
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : "tudo bem";
}

// "objetivo/interesse" do lead, na ordem: interesse declarado → bem → valor da carta.
function cleanInterest(raw: string): string {
  return raw
    .replace(/[_]+/g, " ")
    .replace(/\s*-\s*/g, " a ")
    .replace(/r\$\s*/gi, "R$ ")
    .replace(/\s+/g, " ")
    .trim();
}

function interestLabel(lead: any): string {
  const asset = (lead.asset_type || "").trim().toLowerCase();
  const credit = lead.credit_value != null && Number(lead.credit_value) > 0 ? Number(lead.credit_value) : null;
  const interest = cleanInterest(lead.interest || "");
  // Interesse que é só faixa de valor (ex.: "R$ 300 mil a R$ 500 mil").
  if (interest && /r\$/i.test(interest) && !/[a-zA-Z]{4,}/.test(interest.replace(/r\$|mil|milh(ã|a)o(es)?/gi, ""))) {
    return asset
      ? `um consórcio de ${asset} na faixa de ${interest}`
      : `uma carta de crédito na faixa de ${interest}`;
  }
  if (interest) return interest;
  if (asset && credit) return `um consórcio de ${asset} de ${brl(credit)}`;
  if (asset) return `um consórcio de ${asset}`;
  if (credit) return `uma carta de crédito de ${brl(credit)}`;
  return "uma carta de crédito";
}


function buildMessage(lead: any): string {
  const greeting = saoPauloHour() < 12 ? "Bom dia" : "Boa tarde";
  return (
    `${greeting}, ${firstName(lead.name)}! 👋 Aqui é da Embracon.\n\n` +
    `Você nos procurou um tempo atrás sobre ${interestLabel(lead)} e estou passando para retomar seu atendimento.\n\n` +
    `Me diz uma coisa: você chegou a resolver essa questão ou ainda está buscando uma opção que faça sentido para você?\n\n` +
    `Se ainda estiver buscando, posso verificar novamente as melhores opções disponíveis hoje para o seu perfil.`
  );
}

// Score de probabilidade de voltar à negociação (contexto, nunca aleatório).
function scoreLead(lead: any, inbound: number, outbound: number): number {
  let score = 0;
  if (inbound >= 1) score += 2;            // já respondeu alguma vez
  if (inbound >= 3) score += 1;            // conversou de verdade
  if (lead.credit_value != null && Number(lead.credit_value) > 0) score += 1;
  if (Number(lead.credit_value) >= 100000) score += 1;
  if ((lead.interest || "").trim() || (lead.asset_type || "").trim()) score += 1;
  if ((lead.name || "").trim()) score += 1;
  if (lead.temperature === "hot") score += 2;
  else if (lead.temperature === "warm") score += 1;
  if ((lead.qualification_status || "") === "qualificado") score += 2;
  if (outbound > 0 && inbound === 0) score -= 2; // nunca respondeu nada
  const reason = (lead.disqualification_reason || "").toLowerCase();
  if (/sem\s*interesse|n(ã|a)o\s*quer/i.test(reason)) score -= 2;
  if (/sem\s*(dinheiro|condi(ç|c)(õ|o)es)|desempregad|negativad|score\s*baixo/i.test(reason)) score -= 1;
  if (/(só|so)\s*(depois|mais\s*(para\s*)?frente)|futuro|ano\s*que\s*vem|retomar/i.test(reason)) score += 2;
  if (/n(ã|a)o\s*(respondeu|atendeu)|sem\s*retorno|sumiu/i.test(reason)) score += 1;
  return score;
}

function isHardLoss(lead: any): boolean {
  const reason = String(lead.disqualification_reason || "");
  if (!reason) return false;
  return HARD_LOSS_PATTERNS.some((re) => re.test(reason));
}

async function consultantInstance(admin: any, tenantId: string, userId: string | null) {
  if (!userId) return null;
  const { data } = await admin
    .from("whatsapp_instances")
    .select("id,server_url,instance_token,phone_number")
    .eq("tenant_id", tenantId)
    .eq("seller_user_id", userId)
    .or("is_connected.eq.true,status.eq.connected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.server_url && data?.instance_token) return data;
  return null;
}

async function sendTyping(serverUrl: string, token: string, number: string, text: string) {
  const delay = Math.min(6000, 900 + text.length * 40);
  try {
    await fetch(`${serverUrl.replace(/\/$/, "")}/sendPresence`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ number, presence: "composing", delay }),
    });
  } catch (_) { /* provider pode não suportar */ }
  await new Promise((r) => setTimeout(r, delay));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const body = await req.json().catch(() => ({} as any));
    const dryRun = body?.dry_run === true;
    const onlyMemberId: string | null = body?.member_id ?? null;

    const hour = saoPauloHour();
    if (!dryRun && (hour < 9 || hour >= 19)) {
      return json({ ok: true, skipped: "fora do horário comercial (9h–19h)" });
    }

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const startOfDayISO = new Date(startOfDay.getTime() + 3 * 60 * 60 * 1000).toISOString(); // 00h SP

    // Consultores ativos que possuem leads perdidos.
    const { data: members } = await admin
      .from("tenant_members")
      .select("id, tenant_id, user_id, display_name, followup_active, followup_daily_limit")
      .eq("is_active", true);

    const results: any[] = [];

    for (const member of members ?? []) {
      if (onlyMemberId && member.id !== onlyMemberId) continue;
      if (SKIP_MEMBER_IDS.has(member.id)) continue;
      if (member.followup_active !== true) continue;

      const dailyLimit = member.followup_daily_limit ?? DAILY_LIMIT_PER_CONSULTANT;

      // Cota diária.
      const { data: sentToday } = await admin
        .from("lead_notifications")
        .select("id, lead_id")
        .eq("type", NOTIF_TYPE)
        .eq("recipient_member_id", member.id)
        .gte("sent_at", startOfDayISO);
      if ((sentToday?.length ?? 0) >= dailyLimit) continue;

      const instance = await consultantInstance(admin, member.tenant_id, member.user_id);
      if (!instance) {
        results.push({ member: member.display_name, skipped: "whatsapp do consultor não conectado" });
        continue;
      }

      // Leads perdidos do consultor — dos mais ANTIGOS para os mais novos.
      const { data: lostLeads } = await admin
        .from("leads")
        .select("id, tenant_id, name, phone, interest, asset_type, credit_value, temperature, qualification_status, disqualification_reason, stage, status, last_contact_at, last_message_at, created_at, assigned_member_id, metadata")
        .eq("tenant_id", member.tenant_id)
        .eq("assigned_member_id", member.id)
        .or("stage.eq.perdido,status.eq.lost")
        .not("phone", "is", null)
        .order("created_at", { ascending: true })
        .limit(120);

      let picked: { lead: any; score: number } | null = null;
      const cutoff = Date.now() - MIN_DAYS_SINCE_LAST_CONTACT * 86400000;
      const cooldown = new Date(Date.now() - REACTIVATION_COOLDOWN_DAYS * 86400000).toISOString();

      for (const lead of lostLeads ?? []) {
        if (isHardLoss(lead)) continue;
        const lastTouch = new Date(lead.last_message_at || lead.last_contact_at || lead.created_at).getTime();
        if (lastTouch > cutoff) continue;

        // Já foi reativado recentemente?
        const { data: already } = await admin
          .from("lead_notifications")
          .select("id")
          .eq("lead_id", lead.id)
          .eq("type", NOTIF_TYPE)
          .gte("sent_at", cooldown)
          .limit(1)
          .maybeSingle();
        if (already) continue;

        const { count: inbound } = await admin
          .from("messages").select("id", { count: "exact", head: true })
          .eq("lead_id", lead.id).eq("direction", "inbound");
        const { count: outbound } = await admin
          .from("messages").select("id", { count: "exact", head: true })
          .eq("lead_id", lead.id).eq("direction", "outbound");

        const score = scoreLead(lead, inbound ?? 0, outbound ?? 0);
        if (score < MIN_SCORE) continue;
        picked = { lead, score };
        break; // mais antigo elegível primeiro
      }

      if (!picked) {
        results.push({ member: member.display_name, skipped: "nenhum lead perdido elegível" });
        continue;
      }

      const lead = picked.lead;
      const text = buildMessage(lead);
      const phoneDigits = String(lead.phone).replace(/\D/g, "");

      if (dryRun) {
        results.push({ member: member.display_name, lead_id: lead.id, score: picked.score, preview: text, dry_run: true });
        continue;
      }

      await sendTyping(instance.server_url, instance.instance_token, phoneDigits, text);
      const r = await fetch(`${instance.server_url.replace(/\/$/, "")}/send/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: instance.instance_token },
        body: JSON.stringify({ number: phoneDigits, text, message: text }),
      });
      const raw = await r.text();
      if (!r.ok) {
        results.push({ member: member.display_name, lead_id: lead.id, ok: false, error: raw.slice(0, 200) });
        continue;
      }

      // Registra conversa + mensagem no CRM.
      const { data: conv } = await admin
        .from("conversations").select("id")
        .eq("tenant_id", lead.tenant_id).eq("lead_id", lead.id).limit(1).maybeSingle();
      let convId = conv?.id as string | undefined;
      if (!convId) {
        const { data: newConv } = await admin.from("conversations").insert({
          tenant_id: lead.tenant_id,
          lead_id: lead.id,
          whatsapp_instance_id: instance.id,
          channel: "whatsapp",
          status: "open",
          last_message_at: new Date().toISOString(),
          last_message_preview: text.slice(0, 120),
        }).select("id").maybeSingle();
        convId = newConv?.id;
      } else {
        await admin.from("conversations").update({
          last_message_at: new Date().toISOString(),
          last_message_preview: text.slice(0, 120),
        }).eq("id", convId);
      }
      if (convId) {
        await admin.from("messages").insert({
          tenant_id: lead.tenant_id,
          conversation_id: convId,
          lead_id: lead.id,
          whatsapp_instance_id: instance.id,
          direction: "outbound",
          body: text,
          content: text,
          status: "sent",
          metadata: { reactivation: true, score: picked.score },
        });
      }

      const prevMeta = (lead as { metadata?: Record<string, unknown> }).metadata ?? {};
      await admin.from("leads").update({
        last_message_at: new Date().toISOString(),
        last_contact_at: new Date().toISOString(),
        metadata: {
          ...(typeof prevMeta === "object" && prevMeta ? prevMeta : {}),
          reactivated_at: new Date().toISOString(),
          reactivation_count: Number((prevMeta as Record<string, unknown>)?.reactivation_count ?? 0) + 1,
        },
      }).eq("id", lead.id);

      await admin.from("lead_notifications").insert({
        tenant_id: lead.tenant_id,
        lead_id: lead.id,
        type: NOTIF_TYPE,
        recipient_member_id: member.id,
        recipient_phone: phoneDigits,
        message_sent: text,
        delivered: true,
      });

      results.push({ member: member.display_name, lead_id: lead.id, score: picked.score, ok: true });
    }

    return json({ ok: true, sent: results.filter((r) => r.ok).length, results });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
