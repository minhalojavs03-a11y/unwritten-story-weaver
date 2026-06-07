import { useMemo } from "react";
import { useLeads, useTenantMembers } from "@/hooks/useData";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { stageLabels, stageOrder, type Stage } from "@/data/mock";

export type Period = "today" | "7d" | "30d" | "month" | "year" | "all";

export const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoje", "7d": "7 dias", "30d": "30 dias", month: "Este mês", year: "Este ano", all: "Tudo",
};

export function periodStart(p: Period): Date | null {
  const now = new Date();
  if (p === "all") return null;
  if (p === "today") { const d = new Date(now); d.setHours(0,0,0,0); return d; }
  if (p === "7d") { const d = new Date(now); d.setDate(d.getDate()-7); return d; }
  if (p === "30d") { const d = new Date(now); d.setDate(d.getDate()-30); return d; }
  if (p === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (p === "year") return new Date(now.getFullYear(), 0, 1);
  return null;
}

export const fmtBRL = (n: number) =>
  n >= 1_000_000 ? `R$ ${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `R$ ${(n / 1_000).toFixed(0)}k`
  : `R$ ${Math.round(n).toLocaleString("pt-BR")}`;

export const fmtPct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");

function data_lost_pct(lost: number, total: number) { return total > 0 ? (lost / total) * 100 : 0; }

export function useReportData(
  period: Period,
  memberFilter: string,
  scopeMemberId?: string | null,
  scopeTenantId?: string | null,
) {
  const effectiveUser = useEffectiveUser();
  // scopeTenantId undefined = padrão; null = global (superadmin); string = tenant específico
  const { data: allLeads = [] } = useLeads(scopeTenantId !== undefined ? { tenantId: scopeTenantId } : undefined);
  const { data: members = [] } = useTenantMembers(scopeTenantId === null ? null : scopeTenantId);

  return useMemo(() => {
    const memberUserById = new Map(members.map((m: any) => [m.id, m.user_id ?? null]));
    const scopedUserId = effectiveUser.isImpersonating && scopeMemberId === effectiveUser.memberId ? effectiveUser.id : null;
    const belongsToMember = (lead: any, memberId: string) =>
      lead.assigned_member_id === memberId
      || (!!memberUserById.get(memberId) && lead.assigned_to === memberUserById.get(memberId))
      || (!!scopedUserId && scopeMemberId === memberId && lead.assigned_to === scopedUserId);
    const start = periodStart(period);
    let leads = allLeads.filter((l) => !start || (l.created_at && new Date(l.created_at) >= start));
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
    if (insights.length === 0) {
      insights.push({ level: "info", text: "Sem destaques relevantes no período selecionado", tag: "Geral" });
    }

    return {
      total, contacted, won: won.length, lost: lost.length, inMeeting: inMeeting.length,
      revenue, avgTicket, convRate,
      funnel, maxStage, campaigns, monthly, lostReasons, memberStats,
      weekly: weeklySorted, responseHeatmap, pipelineIntel, healthScore, healthDims, insights,
    };
  }, [allLeads, members, period, memberFilter, scopeMemberId, effectiveUser.isImpersonating, effectiveUser.memberId, effectiveUser.id]);
}

export type ReportData = ReturnType<typeof useReportData>;
