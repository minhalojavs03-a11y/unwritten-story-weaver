import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLeads, useTenantMembers } from "@/hooks/useData";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { supabase } from "@/integrations/supabase/client";
import { FERACON_TENANT_ID } from "@/lib/feracon";
import { stageLabels, stageOrder, type Stage } from "@/data/mock";

// Busca leads do Nilton (planilha) e converte para o shape mínimo usado nos relatórios,
// para que o KPI de "Leads no período" bata com o card de "Leads Hoje" do Início (RPC).
function useNiltonLeadsForReports(scopeTenantId?: string | null) {
  const tenantId = scopeTenantId === undefined ? FERACON_TENANT_ID : scopeTenantId;
  return useQuery({
    queryKey: ["nilton_leads_for_reports", tenantId ?? "__all__"],
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase
        .from("nilton_leads")
        .select("id, tenant_id, assigned_to, created_time, imported_at, updated_at, status, campaign_name, platform")
        .neq("status", "historico")
        .order("created_time", { ascending: false })
        .limit(5000);
      if (tenantId) q = q.eq("tenant_id", tenantId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((n: {
        id: string; tenant_id: string | null; assigned_to: string | null;
        created_time: string | null; imported_at: string | null; updated_at: string | null;
        campaign_name: string | null; platform: string | null;
      }) => ({
        id: n.id,
        tenant_id: n.tenant_id,
        assigned_to: n.assigned_to,
        assigned_member_id: null as string | null,
        assigned_member_at: n.created_time ?? n.imported_at,
        created_at: n.created_time ?? n.imported_at ?? new Date().toISOString(),
        updated_at: n.updated_at ?? n.created_time ?? n.imported_at ?? new Date().toISOString(),
        last_contact_at: null as string | null,
        stage: "novo",
        kind: "lead",
        credit_value: 0,
        source: n.platform ? `${n.platform}_ads` : "nilton_planilha",
        disqualification_reason: null as string | null,
        temperature: null as string | null,
        phone: null as string | null,
        imported_from_sheet: true,
        __nilton: true as const,
      }));
    },
  });
}

export type Period = "today" | "yesterday" | "7d" | "30d" | "month" | "year" | "all";

export const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoje", yesterday: "Ontem", "7d": "7 dias", "30d": "30 dias", month: "Este mês", year: "Este ano", all: "Tudo",
};

export function periodStart(p: Period): Date | null {
  return periodRange(p).start;
}

export function periodRange(p: Period): { start: Date | null; end: Date | null } {
  const now = new Date();
  if (p === "all") return { start: null, end: null };
  if (p === "today") { const d = new Date(now); d.setHours(0,0,0,0); return { start: d, end: null }; }
  if (p === "yesterday") {
    const s = new Date(now); s.setDate(s.getDate()-1); s.setHours(0,0,0,0);
    const e = new Date(now); e.setHours(0,0,0,0);
    return { start: s, end: e };
  }
  if (p === "7d") { const d = new Date(now); d.setDate(d.getDate()-7); return { start: d, end: null }; }
  if (p === "30d") { const d = new Date(now); d.setDate(d.getDate()-30); return { start: d, end: null }; }
  if (p === "month") return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: null };
  if (p === "year") return { start: new Date(now.getFullYear(), 0, 1), end: null };
  return { start: null, end: null };
}

export const fmtBRL = (n: number) =>
  n >= 1_000_000 ? `R$ ${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `R$ ${(n / 1_000).toFixed(0)}k`
  : `R$ ${Math.round(n).toLocaleString("pt-BR")}`;

export const fmtPct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");

function data_lost_pct(lost: number, total: number) { return total > 0 ? (lost / total) * 100 : 0; }

type ReportLeadScope = { assigned_member_id?: string | null; assigned_to?: string | null };
type ReportMemberScope = { id: string; user_id?: string | null };

export function useReportData(
  period: Period,
  memberFilter: string,
  scopeMemberId?: string | null,
  scopeTenantId?: string | null,
  customRange?: { start: Date | null; end: Date | null } | null,
) {
  const effectiveUser = useEffectiveUser();
  // scopeTenantId undefined = padrão; null = global (superadmin); string = tenant específico
  const { data: leadsBase = [] } = useLeads(scopeTenantId !== undefined ? { tenantId: scopeTenantId } : undefined);
  const { data: niltonLeads = [] } = useNiltonLeadsForReports(scopeTenantId);
  const { data: members = [] } = useTenantMembers(scopeTenantId === null ? null : scopeTenantId);
  const allLeads = useMemo(
    () => [...leadsBase, ...(niltonLeads as unknown as typeof leadsBase)],
    [leadsBase, niltonLeads],
  );

  // Resolve nomes "bonitos" (full_name) via profiles para as vendas — display_name no
  // tenant_members às vezes é o username, o que fica feio nos detalhes da venda.
  const wonUserIds = useMemo(() => {
    const ids = new Set<string>();
    for (const l of leadsBase) {
      if (l.stage === "comprou" && l.assigned_to) ids.add(l.assigned_to as string);
    }
    return Array.from(ids);
  }, [leadsBase]);

  const { data: salesProfiles = [] } = useQuery({
    queryKey: ["sales-profiles", wonUserIds.slice().sort().join(",")],
    enabled: wonUserIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, display_name, email")
        .in("id", wonUserIds);
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string | null; display_name: string | null; email: string | null }[];
    },
  });

  return useMemo(() => {
    const memberUserById = new Map(members.map((m: ReportMemberScope) => [m.id, m.user_id ?? null]));
    const scopedUserId = effectiveUser.isImpersonating && scopeMemberId === effectiveUser.memberId ? effectiveUser.id : null;
    const belongsToMember = (lead: ReportLeadScope, memberId: string) =>
      lead.assigned_member_id === memberId
      || (!!memberUserById.get(memberId) && lead.assigned_to === memberUserById.get(memberId))
      || (!!scopedUserId && scopeMemberId === memberId && lead.assigned_to === scopedUserId);
    const range = customRange ?? periodRange(period);
    const { start, end } = range;
    let leads = allLeads.filter((l) => {
      if (!l.created_at) return !start;
      const t = new Date(l.created_at).getTime();
      if (start && t < start.getTime()) return false;
      if (end && t >= end.getTime()) return false;
      return true;
    });
    if (scopeMemberId) leads = leads.filter((l) => belongsToMember(l, scopeMemberId));
    else if (memberFilter && memberFilter !== "all") leads = leads.filter((l) => belongsToMember(l, memberFilter));

    const total = leads.length;
    const contacted = leads.filter((l) => l.last_contact_at).length;
    const won = leads.filter((l) => l.stage === "comprou");
    const lost = leads.filter((l) => l.stage === "perdido");
    const inMeeting = leads.filter((l) => ["agendado", "compareceu"].includes(l.stage ?? ""));
    const revenue = won.reduce((s, l) => s + (Number(l.credit_value) || 0), 0);
    const avgTicket = won.length > 0 ? revenue / won.length : 0;
    const convRate = total > 0 ? (won.length / total) * 100 : 0;

    const funnel = stageOrder.filter((s) => s !== "perdido").map((s) => ({
      key: s as Stage,
      stage: stageLabels[s],
      count: leads.filter((l) => l.stage === s).length,
    }));
    const maxStage = Math.max(1, ...funnel.map((f) => f.count));

    const sourceMap = new Map<string, { leads: number; won: number; revenue: number }>();
    leads.forEach((l) => {
      const src = l.source || "Direto";
      const entry = sourceMap.get(src) || { leads: 0, won: 0, revenue: 0 };
      entry.leads += 1;
      if (l.stage === "comprou") { entry.won += 1; entry.revenue += Number(l.credit_value) || 0; }
      sourceMap.set(src, entry);
    });
    const campaigns = Array.from(sourceMap.entries())
      .map(([name, v]) => ({ name, ...v, conv: v.leads > 0 ? (v.won / v.leads) * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue);

    const monthly: { month: string; revenue: number; leads: number }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const label = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
      const monthLeads = allLeads.filter((l) => l.created_at && new Date(l.created_at) >= d && new Date(l.created_at) < next);
      const monthRev = monthLeads.filter((l) => l.stage === "comprou").reduce((s, l) => s + (Number(l.credit_value) || 0), 0);
      monthly.push({ month: label.charAt(0).toUpperCase() + label.slice(1), revenue: monthRev, leads: monthLeads.length });
    }

    const lostMap = new Map<string, number>();
    lost.forEach((l) => {
      const r = (l.disqualification_reason || "Não informado").trim();
      lostMap.set(r, (lostMap.get(r) || 0) + 1);
    });
    const lostReasons = Array.from(lostMap.entries())
      .map(([reason, count]) => ({ reason, count, pct: lost.length > 0 ? (count / lost.length) * 100 : 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const memberStats = members.map((m) => {
      const my = leads.filter((l) => belongsToMember(l, m.id));
      const myContacted = my.filter((l) => l.last_contact_at).length;
      const myWon = my.filter((l) => l.stage === "comprou");
      const myLost = my.filter((l) => l.stage === "perdido").length;
      const myMeetings = my.filter((l) => ["agendado", "compareceu"].includes(l.stage ?? "")).length;
      const myRevenue = myWon.reduce((s, l) => s + (Number(l.credit_value) || 0), 0);
      const respTimes = my
        .filter((l) => l.assigned_member_at && l.created_at)
        .map((l) => (new Date(l.assigned_member_at!).getTime() - new Date(l.created_at).getTime()) / 3_600_000)
        .filter((h) => h >= 0 && h < 24 * 30);
      const avgResp = respTimes.length > 0 ? respTimes.reduce((a, b) => a + b, 0) / respTimes.length : 0;
      const conv = my.length > 0 ? (myWon.length / my.length) * 100 : 0;
      return {
        id: m.id, name: m.display_name, role: m.role_label || "Consultor",
        leads: my.length, contacted: myContacted, meetings: myMeetings,
        closed: myWon.length, lost: myLost, revenue: myRevenue, conv, avgResp,
        uncontacted: my.length - myContacted,
      };
    });

    const weekdayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const weekStart = new Date(); weekStart.setHours(0,0,0,0); weekStart.setDate(weekStart.getDate() - 6);
    const weekly = weekdayLabels.map((d) => ({ d, contatos: 0, reunioes: 0, fechados: 0 }));
    const weekOrder = [1,2,3,4,5,6,0];
    const weeklySorted = weekOrder.map((i) => weekly[i]);
    allLeads.forEach((l) => {
      if (l.last_contact_at) {
        const dt = new Date(l.last_contact_at);
        if (dt >= weekStart) weeklySorted[(dt.getDay() + 6) % 7].contatos += 1;
      }
      if (["agendado", "compareceu"].includes(l.stage ?? "") && l.updated_at) {
        const dt = new Date(l.updated_at);
        if (dt >= weekStart) weeklySorted[(dt.getDay() + 6) % 7].reunioes += 1;
      }
      if (l.stage === "comprou" && l.updated_at) {
        const dt = new Date(l.updated_at);
        if (dt >= weekStart) weeklySorted[(dt.getDay() + 6) % 7].fechados += 1;
      }
    });

    const hourBuckets: { sum: number; n: number }[] = Array.from({ length: 14 }, () => ({ sum: 0, n: 0 }));
    leads.forEach((l) => {
      if (!l.created_at || !l.last_contact_at) return;
      const created = new Date(l.created_at);
      const responded = new Date(l.last_contact_at);
      const diffH = (responded.getTime() - created.getTime()) / 3_600_000;
      if (diffH < 0 || diffH > 72) return;
      const h = created.getHours();
      if (h < 8 || h > 21) return;
      const idx = h - 8;
      hourBuckets[idx].sum += diffH;
      hourBuckets[idx].n += 1;
    });
    const responseHeatmap = hourBuckets.map((b, i) => ({
      h: `${String(i + 8).padStart(2, "0")}h`,
      avg: b.n > 0 ? +(b.sum / b.n).toFixed(1) : 0,
    }));

    const NOW = Date.now();
    const pipelineIntel = funnel.map((s, idx) => {
      const inStage = leads.filter((l) => l.stage === s.key);
      const daysList = inStage
        .map((l) => l.updated_at ? (NOW - new Date(l.updated_at).getTime()) / 86_400_000 : 0)
        .filter((d) => d >= 0 && d < 365);
      const avgDays = daysList.length > 0 ? daysList.reduce((a, b) => a + b, 0) / daysList.length : 0;
      const next = funnel[idx + 1];
      const nextPct = next && s.count > 0 ? Math.round((next.count / s.count) * 100) : null;
      return { ...s, avgDays, nextPct, isBottleneck: avgDays > 6 };
    });

    const dimContacted = total > 0 ? Math.round((contacted / total) * 100) : 0;
    const dimConv = Math.min(100, Math.round(convRate * 5));
    const dimFollowup = total > 0
      ? Math.round((leads.filter((l) => l.last_contact_at && (NOW - new Date(l.last_contact_at).getTime()) / 86_400_000 < 7).length / total) * 100)
      : 0;
    const dimSpeed = (() => {
      const speeds = leads
        .filter((l) => l.assigned_member_at && l.created_at)
        .map((l) => (new Date(l.assigned_member_at!).getTime() - new Date(l.created_at).getTime()) / 60000)
        .filter((m) => m >= 0 && m < 1440);
      if (speeds.length === 0) return 0;
      const avgMin = speeds.reduce((a, b) => a + b, 0) / speeds.length;
      return Math.max(0, Math.min(100, Math.round(100 - ((avgMin - 5) / 55) * 100)));
    })();
    const dimEngagement = (() => {
      const active = members.filter((mb) => leads.some((l) => belongsToMember(l, mb.id) && l.last_contact_at && (NOW - new Date(l.last_contact_at).getTime()) / 86_400_000 < 7)).length;
      return members.length > 0 ? Math.round((active / members.length) * 100) : 0;
    })();
    const healthDims = [
      { name: "Velocidade de resposta", v: dimSpeed },
      { name: "Consistência de follow-up", v: dimFollowup },
      { name: "Cobertura de contato", v: dimContacted },
      { name: "Engajamento da equipe", v: dimEngagement },
      { name: "Eficiência de conversão", v: dimConv },
    ];
    const healthScore = Math.round(healthDims.reduce((a, b) => a + b.v, 0) / healthDims.length);

    const insights: { level: "success" | "warning" | "info"; text: string; tag: string }[] = [];
    const sortedByRev = [...memberStats].sort((a, b) => b.revenue - a.revenue);
    const topPerformer = sortedByRev[0];
    if (topPerformer && topPerformer.revenue > 0) {
      insights.push({ level: "success", text: `${topPerformer.name} lidera em receita com ${fmtBRL(topPerformer.revenue)} no período`, tag: "Consultor" });
    }
    const topConv = [...memberStats].filter((m) => m.leads >= 3).sort((a, b) => b.conv - a.conv)[0];
    if (topConv && topConv.conv > 0) {
      insights.push({ level: "success", text: `${topConv.name} tem a maior taxa de fechamento: ${topConv.conv.toFixed(1)}%`, tag: "Conversão" });
    }
    const bottleneck = pipelineIntel.find((s) => s.isBottleneck);
    if (bottleneck) {
      insights.push({ level: "warning", text: `Gargalo detectado em "${bottleneck.stage}" — média de ${bottleneck.avgDays.toFixed(1)} dias parado`, tag: "Pipeline" });
    }
    const topCampaign = campaigns[0];
    if (topCampaign && topCampaign.revenue > 0) {
      insights.push({ level: "info", text: `Canal "${topCampaign.name}" gerou ${fmtBRL(topCampaign.revenue)} em receita`, tag: "Campanha" });
    }
    if (dimSpeed < 50 && leads.length > 0) {
      insights.push({ level: "warning", text: `Velocidade de atendimento abaixo do ideal — score ${dimSpeed}/100`, tag: "SLA" });
    }
    if (data_lost_pct(lost.length, total) > 30) {
      insights.push({ level: "warning", text: `Taxa de perda elevada: ${data_lost_pct(lost.length, total).toFixed(0)}% dos leads do período`, tag: "Funil" });
    }

    // Insights complementares — garantem sinal mesmo sem fechamentos ainda
    const topByLeads = [...memberStats].sort((a, b) => b.leads - a.leads)[0];
    if (topByLeads && topByLeads.leads > 0) {
      insights.push({ level: "info", text: `${topByLeads.name} concentra o maior volume: ${topByLeads.leads} leads no período`, tag: "Carteira" });
    }
    const topMeetings = [...memberStats].sort((a, b) => b.meetings - a.meetings)[0];
    if (topMeetings && topMeetings.meetings > 0) {
      insights.push({ level: "success", text: `${topMeetings.name} lidera em agendamentos: ${topMeetings.meetings} reuniões`, tag: "Agenda" });
    }
    const fastest = [...memberStats].filter((m) => m.avgResp > 0).sort((a, b) => a.avgResp - b.avgResp)[0];
    if (fastest) {
      const mins = Math.round(fastest.avgResp * 60);
      insights.push({ level: "success", text: `${fastest.name} é o mais rápido para assumir: média de ${mins < 60 ? `${mins} min` : `${fastest.avgResp.toFixed(1)} h`}`, tag: "SLA" });
    }
    const uncontacted = leads.filter((l) => !l.last_contact_at).length;
    if (uncontacted > 0 && total > 0) {
      const pct = Math.round((uncontacted / total) * 100);
      if (pct >= 20) {
        insights.push({ level: "warning", text: `${uncontacted} leads (${pct}%) ainda sem primeiro contato registrado`, tag: "Cobertura" });
      } else {
        insights.push({ level: "info", text: `Cobertura de contato em ${100 - pct}% dos leads do período`, tag: "Cobertura" });
      }
    }
    const inAttendance = leads.filter((l) => l.stage === "atendimento").length;
    if (inAttendance > 0) {
      insights.push({ level: "info", text: `${inAttendance} leads em atendimento ativo agora`, tag: "Pipeline" });
    }
    if (topCampaign && topCampaign.leads > 0 && !(topCampaign.revenue > 0)) {
      insights.push({ level: "info", text: `Fonte "${topCampaign.name}" é a que mais traz leads (${topCampaign.leads})`, tag: "Origem" });
    }
    if (total > 0 && insights.length < 3) {
      insights.push({ level: "info", text: `${total} leads no período • ${inMeeting.length} em fase de reunião • ${members.length} consultores ativos`, tag: "Resumo" });
    }

    if (insights.length === 0) {
      insights.push({ level: "info", text: total === 0 ? "Nenhum lead criado no período selecionado — amplie o filtro para ver insights" : "Sem destaques relevantes no período selecionado", tag: "Geral" });
    }

    const memberNameById = new Map(
      members.map((m) => [m.id, (m as { full_name?: string | null }).full_name || m.display_name] as const),
    );
    const memberNameByUserId = new Map(
      members
        .map((m) => [memberUserById.get(m.id), (m as { full_name?: string | null }).full_name || m.display_name] as const)
        .filter(([uid]) => !!uid) as [string, string][],
    );
    const profileNameByUserId = new Map(
      salesProfiles.map((p) => {
        const pretty = p.full_name || p.display_name || (p.email ? p.email.split("@")[0] : "") || "Consultor";
        return [p.id, pretty] as const;
      }),
    );
    const sales = won
      .map((l) => {
        const consultantName =
          (l.assigned_to && profileNameByUserId.get(l.assigned_to as string)) ||
          (l.assigned_member_id && memberNameById.get(l.assigned_member_id)) ||
          (l.assigned_to && memberNameByUserId.get(l.assigned_to)) ||
          "Não atribuído";
        return {
          id: l.id as string,
          name: (l.name as string) || "Sem nome",
          phone: (l.phone as string) || "",
          value: Number(l.credit_value) || 0,
          consultant: consultantName,
          source: (l.source as string) || "Direto",
          assetType: (l.asset_type as string) || null,
          soldAt: (l.updated_at as string) || (l.created_at as string) || null,
        };
      })
      .sort((a, b) => (b.soldAt ?? "").localeCompare(a.soldAt ?? ""));

    return {
      total, contacted, won: won.length, lost: lost.length, inMeeting: inMeeting.length,
      revenue, avgTicket, convRate,
      funnel, maxStage, campaigns, monthly, lostReasons, memberStats,
      weekly: weeklySorted, responseHeatmap, pipelineIntel, healthScore, healthDims, insights,
      sales,
    };
  }, [allLeads, members, salesProfiles, period, memberFilter, scopeMemberId, effectiveUser.isImpersonating, effectiveUser.memberId, effectiveUser.id, customRange?.start?.getTime(), customRange?.end?.getTime()]);
}

export type ReportData = ReturnType<typeof useReportData>;
