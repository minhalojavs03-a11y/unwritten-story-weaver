import { useState } from "react";
import { Users, MessageCircle, Calendar, Flame, ArrowRight, AlertTriangle, Clock4, TrendingUp, Trophy, Gauge, Zap } from "lucide-react";
import { Link } from "react-router-dom";

import { StatCard } from "@/components/oticaflow/StatCard";
import { TempBadge } from "@/components/oticaflow/TempBadge";
import { InitialsAvatar } from "@/components/oticaflow/Avatar";
import { formatTime, timeAgo } from "@/lib/format";
import { PageHeader } from "./PageHeader";
import { useDashboardMetrics, useLeads, useAppointments } from "@/hooks/useData";
import { useMyProfile } from "@/hooks/useProfile";
import { useActiveMember } from "@/contexts/ActiveMemberContext";
import { useEffectiveRole } from "@/hooks/useEffectiveRole";
import { useSupportImpersonation } from "@/hooks/useSupportImpersonation";
import { LeadsHourlyPanel } from "@/components/dashboard/LeadsHourlyPanel";
import { useReportData } from "@/hooks/useReportData";
import { HealthScore, InsightsPanel, PipelineIntel, WeeklyActivity, ResponseHeatmap } from "@/components/dashboard/ExecutiveWidgets";
import { WeekComparison } from "@/components/dashboard/WeekComparison";
import { CoachingPanel } from "@/components/dashboard/CoachingPanel";
import { DashboardScopeFilter, type DashboardScope } from "@/components/dashboard/DashboardScopeFilter";
import { RankCard } from "@/components/gamification/RankCard";
import { PrizesBanner } from "@/components/gamification/PrizesBanner";
import { EloLadder } from "@/components/gamification/EloLadder";
import { PublicLeaderboard } from "@/components/gamification/PublicLeaderboard";
import { MvpOfMonth } from "@/components/gamification/MvpOfMonth";
import { useRanking, useGamificationConfig } from "@/hooks/useGamification";
import { WhatsAppHealthAlert } from "@/components/dashboard/WhatsAppHealthAlert";

export default function DashboardPage() {
  const { data: profile } = useMyProfile();
  const { member } = useActiveMember();
  const { isSuperadmin, isOwner, isSupervisor } = useEffectiveRole();
  const { context: supportContext } = useSupportImpersonation();
  const privileged = isSuperadmin || isOwner || isSupervisor;
  const consultantScopeMemberId = !privileged ? (member?.id ?? null) : null;

  // Filtros do painel — apenas owner/supervisor/superadmin podem trocar.
  // Superadmin vê seletor de tenant; owner/supervisor só de consultor (dentro do próprio tenant).
  const [scope, setScope] = useState<DashboardScope>({ tenantId: null, memberId: null });
  // Para consultor comum, o escopo é fixo nele mesmo.
  const effectiveMemberId = consultantScopeMemberId ?? scope.memberId;
  // tenantId: undefined = padrão (auth tenant ou global p/ superadmin); null = global; string = tenant
  const effectiveTenantOverride: string | null | undefined = isSuperadmin
    ? scope.tenantId // null = todos os tenants, string = tenant selecionado
    : supportContext?.tenant_id ?? undefined; // modo suporte usa explicitamente o tenant visualizado

  const metricsScope = {
    tenantId: effectiveTenantOverride,
    memberId: effectiveMemberId,
  };
  const { data: m } = useDashboardMetrics(metricsScope);
  const leadsOpts = effectiveTenantOverride !== undefined || effectiveMemberId
    ? { kind: "all" as const, tenantId: effectiveTenantOverride, memberId: effectiveMemberId }
    : { kind: "all" as const };
  const { data: allLeads = [] } = useLeads(leadsOpts);
  const leads = allLeads;
  // Em modo suporte (superadmin trocou de tenant), saúda o nome do cliente
  let impersonationName: string | null = null;
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem("impersonation_context") : null;
    if (raw) impersonationName = (JSON.parse(raw)?.tenant_name as string | undefined) ?? null;
  } catch { /* ignore */ }
  const firstName = impersonationName
    ? impersonationName.trim().split(/\s+/)[0]
    : ((member?.display_name ?? profile?.display_name ?? profile?.full_name ?? "")
        .trim()
        .split(/\s+/)[0] ?? "");
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
  const { data: todayAppts = [] } = useAppointments(today, tomorrow, {
    tenantId: effectiveTenantOverride,
    memberId: effectiveMemberId,
  });

  const activeLeads = leads.filter((l) => !["comprou","perdido"].includes(l.stage ?? ""));

  // Executive analytics (only rendered for privileged users)
  const execData = useReportData("30d", "all", effectiveMemberId, effectiveTenantOverride);

  // Speed-to-assume: tempo entre criação do lead e atribuição (em minutos)
  const assignedLeads = leads.filter((l) => l.assigned_member_id && l.assigned_member_at && l.created_at);
  const minutesToAssume = (l: typeof leads[number]) =>
    (new Date(l.assigned_member_at as string).getTime() - new Date(l.created_at).getTime()) / 60000;
  const teamTimes = assignedLeads.map(minutesToAssume).filter((m) => m >= 0 && m < 60 * 24 * 7);
  const myTimes = member?.id
    ? assignedLeads.filter((l) => l.assigned_member_id === member.id).map(minutesToAssume).filter((m) => m >= 0 && m < 60 * 24 * 7)
    : [];
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const teamAvg = avg(teamTimes);
  const myAvg = avg(myTimes);
  const GOAL_MAX = 5; // minutos
  const GOAL_IDEAL = 3;
  // Escala: 0..15 min visível, acima vira "atrasado"
  const SCALE_MAX = 15;
  const pctOf = (v: number) => Math.min(100, (v / SCALE_MAX) * 100);
  const toneOf = (v: number) =>
    v <= GOAL_IDEAL ? "emerald" : v <= GOAL_MAX ? "amber" : "rose";
  const labelOf = (v: number) =>
    v === 0 ? "—" : v < 1 ? `${Math.round(v * 60)}s` : v < 60 ? `${v.toFixed(1)} min` : `${(v / 60).toFixed(1)}h`;
  const toneBar: Record<string, string> = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
  };
  const toneText: Record<string, string> = {
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    rose: "text-rose-600",
  };
  const myStatus =
    myTimes.length === 0
      ? { text: "Sem dados ainda", tone: "muted" as const }
      : myAvg <= GOAL_IDEAL
        ? { text: "Acima do esperado 🚀", tone: "emerald" as const }
        : myAvg <= GOAL_MAX
        ? { text: "Dentro da meta", tone: "amber" as const }
        : { text: "Abaixo do esperado", tone: "rose" as const };
  const diffVsTeam = myTimes.length && teamTimes.length ? myAvg - teamAvg : 0;

  // Ranking público — usado no leaderboard da Início (todos veem todos)
  const { data: ranking = [] } = useRanking("monthly");
  const { data: gamConfig } = useGamificationConfig();
  // Tempo médio de atendimento por membro (em minutos), calculado a partir
  // dos leads visíveis. Para consultor comum só haverá dados próprios.
  const timesByMember: Record<string, number> = (() => {
    const acc: Record<string, { sum: number; n: number }> = {};
    for (const l of assignedLeads) {
      const mid = l.assigned_member_id as string | null;
      if (!mid) continue;
      const min = minutesToAssume(l);
      if (!Number.isFinite(min) || min < 0 || min > 60 * 24 * 7) continue;
      if (!acc[mid]) acc[mid] = { sum: 0, n: 0 };
      acc[mid].sum += min;
      acc[mid].n += 1;
    }
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(acc)) out[k] = v.n ? v.sum / v.n : 0;
    return out;
  })();

  const awaiting = m?.awaitingResponse ?? 0;
  const unattended = leads.filter((l) => !l.last_contact_at && !["comprou","perdido"].includes(l.stage ?? "")).length;

  const now = new Date();
  const hour = now.getHours();
  const saudacao = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const dataExtenso = now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  const dataCap = dataExtenso.charAt(0).toUpperCase() + dataExtenso.slice(1);

  return (
    <>
      <div className="grid grid-cols-1 items-start gap-4 pl-7 pr-4 pt-1 pb-2 md:grid-cols-2 md:pl-8 md:pr-8 md:pt-2 md:pb-3">
        <div className="min-w-0 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-600 ring-1 ring-emerald-500/20">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Painel ao vivo
            </span>
            <h1 className="font-display text-xl font-bold leading-tight tracking-tight md:text-3xl">
              {saudacao}{firstName ? `, ${firstName}` : ""}, vamos vender hoje.
            </h1>
            <p className="mt-1 text-xs text-muted-foreground md:text-sm">{dataCap}</p>
          </div>
          {!privileged && (
            <div className="w-full shrink-0 sm:w-[260px] md:w-[300px]">
              <RankCard variant="compact" asLink className="w-full" />
            </div>
          )}
        </div>
        {privileged && (
          <div className="min-w-0">
            <WhatsAppHealthAlert />
          </div>
        )}
      </div>
      <div className="space-y-4 px-4 pb-6 md:space-y-5 md:px-8 md:pb-8">

        {privileged && (
          <DashboardScopeFilter
            scope={scope}
            onChange={setScope}
            showTenantSelector={isSuperadmin}
          />
        )}


        <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <StatCard to="/clientes" icon={Users} label="Leads Hoje" value={m?.leadsToday ?? 0} iconColor="bg-emerald-500/10 text-emerald-600" />
          <StatCard to="/conversas" icon={MessageCircle} label="Conversas Ativas" value={m?.activeConversations ?? 0} iconColor="bg-violet-500/10 text-violet-600" />
          <StatCard to="/agenda" icon={Calendar} label="Reuniões hoje" value={m?.appointmentsToday ?? 0} iconColor="bg-sky-500/10 text-sky-600" />
          <StatCard to="/conversas?tab=hot" icon={Flame} label="Leads Quentes" value={m?.hotOpportunities ?? 0} iconColor="bg-rose-500/10 text-rose-600" />
        </section>

        <LeadsHourlyPanel days={30} tenantId={effectiveTenantOverride} memberId={effectiveMemberId} />

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Ações rápidas</h2>
          <div className="flex flex-wrap gap-2">
            <ActionPill label="Responder não lidas" badge={awaiting} tone="info" to="/conversas?tab=unread" />
            <ActionPill label="Ver agenda" badge={m?.appointmentsToday ?? 0} tone="success" to="/agenda" />
            <ActionPill label="Leads quentes" badge={m?.hotOpportunities ?? 0} tone="destructive" to="/conversas?tab=hot" />
          </div>
        </section>

        <MvpOfMonth rows={ranking} highlightMemberId={member?.id ?? null} />

        {!privileged && <EloLadder variant="full" asLink />}
        {!privileged && <PrizesBanner compact />}


        {/* Placar público da equipe — exibe vendas, reuniões, contatos,
            leads assumidos e tempo médio de atendimento de TODOS. */}
        <PublicLeaderboard
          rows={ranking}
          config={gamConfig}
          highlightMemberId={member?.id ?? null}
          timesByMember={timesByMember}
        />

        {privileged && (
          <section className="space-y-4 md:space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold tracking-tight md:text-lg">Visão executiva</h2>
                <p className="text-xs text-muted-foreground">Inteligência operacional dos últimos 30 dias</p>
              </div>
              <Link to="/relatorios" className="shrink-0 text-xs font-medium text-primary hover:underline">Abrir Relatórios & BI →</Link>
            </div>

            <PipelineIntel pipeline={execData.pipelineIntel} total={execData.total} />

            <div className="grid gap-4 lg:grid-cols-5">
              <div className="lg:col-span-2"><HealthScore score={execData.healthScore} dims={execData.healthDims} /></div>
              <div className="lg:col-span-3"><InsightsPanel insights={execData.insights} /></div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <WeeklyActivity weekly={execData.weekly} />
              <ResponseHeatmap heatmap={execData.responseHeatmap} />
            </div>

            <WeekComparison leads={leads} />

            <CoachingPanel days={30} />
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="client-card rounded-2xl min-w-0 overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3 md:px-5 md:py-4">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-primary" />
                <h2 className="font-display text-base font-semibold tracking-tight md:text-lg">Velocidade de atendimento</h2>
              </div>
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Meta {GOAL_IDEAL}–{GOAL_MAX} min
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-gradient-to-r from-primary/5 to-transparent px-4 py-2.5 md:px-5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Zap className={`h-3.5 w-3.5 ${myStatus.tone === "muted" ? "text-muted-foreground" : toneText[myStatus.tone]}`} />
                <span>Seu status</span>
              </div>
              <span className={`font-display text-sm font-bold tracking-tight md:text-base ${myStatus.tone === "muted" ? "text-muted-foreground" : toneText[myStatus.tone]}`}>
                {myStatus.text}
              </span>
            </div>

            <div className="space-y-5 px-4 py-4 md:px-5 md:py-5">
              {/* Você */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary" />
                    <span className="font-semibold text-foreground">Você</span>
                    {member?.display_name && (
                      <span className="text-muted-foreground">· {member.display_name.split(" ")[0]}</span>
                    )}
                  </div>
                  <span className={`font-display text-sm font-bold tabular-nums ${myTimes.length === 0 ? "text-muted-foreground" : toneText[toneOf(myAvg)]}`}>
                    {myTimes.length === 0 ? "—" : labelOf(myAvg)}
                  </span>
                </div>
                <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-200/70">
                  {/* faixa meta 3-5 min */}
                  <div
                    className="absolute inset-y-0 bg-emerald-500/15 border-x border-emerald-500/40"
                    style={{ left: `${pctOf(GOAL_IDEAL)}%`, width: `${pctOf(GOAL_MAX) - pctOf(GOAL_IDEAL)}%` }}
                  />
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${myTimes.length === 0 ? "bg-slate-300" : toneBar[toneOf(myAvg)]}`}
                    style={{ width: `${myTimes.length === 0 ? 0 : pctOf(myAvg)}%` }}
                  />
                </div>
              </div>

              {/* Equipe */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-400" />
                    <span className="font-semibold text-foreground">Equipe</span>
                    <span className="text-muted-foreground">· média geral</span>
                  </div>
                  <span className={`font-display text-sm font-bold tabular-nums ${teamTimes.length === 0 ? "text-muted-foreground" : toneText[toneOf(teamAvg)]}`}>
                    {teamTimes.length === 0 ? "—" : labelOf(teamAvg)}
                  </span>
                </div>
                <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-200/70">
                  <div
                    className="absolute inset-y-0 bg-emerald-500/15 border-x border-emerald-500/40"
                    style={{ left: `${pctOf(GOAL_IDEAL)}%`, width: `${pctOf(GOAL_MAX) - pctOf(GOAL_IDEAL)}%` }}
                  />
                  <div
                    className="h-full rounded-full bg-slate-500 transition-all duration-700"
                    style={{ width: `${teamTimes.length === 0 ? 0 : pctOf(teamAvg)}%` }}
                  />
                </div>
              </div>

              {/* Escala */}
              <div className="flex justify-between text-[10px] font-medium text-muted-foreground tabular-nums">
                <span>0</span>
                <span className="text-emerald-600">{GOAL_IDEAL}m</span>
                <span className="text-amber-600">{GOAL_MAX}m</span>
                <span>10m</span>
                <span className="text-rose-600">{SCALE_MAX}m+</span>
              </div>

              {/* Comparativo */}
              {myTimes.length > 0 && teamTimes.length > 0 && (
                <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5 text-xs">
                  {Math.abs(diffVsTeam) < 0.2 ? (
                    <span className="text-muted-foreground">Você está no ritmo da equipe.</span>
                  ) : diffVsTeam < 0 ? (
                    <span>
                      <span className="font-semibold text-emerald-600">{labelOf(Math.abs(diffVsTeam))} mais rápido</span>
                      <span className="text-muted-foreground"> que a média da equipe. Continue assim 💪</span>
                    </span>
                  ) : (
                    <span>
                      <span className="font-semibold text-rose-600">{labelOf(diffVsTeam)} mais lento</span>
                      <span className="text-muted-foreground"> que a média da equipe. Assuma os leads mais rápido para subir no ranking.</span>
                    </span>
                  )}
                </div>
              )}

              <div className="text-[11px] text-muted-foreground">
                Baseado em {assignedLeads.length} lead{assignedLeads.length === 1 ? "" : "s"} atribuído{assignedLeads.length === 1 ? "" : "s"} · tempo entre criação e assumir
              </div>
            </div>
          </div>



          <div className="client-card rounded-2xl min-w-0 overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3 md:px-5 md:py-4">
              <div className="flex items-center gap-2">
                <Clock4 className="h-4 w-4 text-warning" />
                <h2 className="font-display text-base font-semibold tracking-tight md:text-lg">Follow-ups pendentes</h2>
              </div>
              <Link to="/conversas" className="shrink-0 text-xs font-medium text-primary hover:underline">Ver todos →</Link>
            </div>
            {(() => {
              const NOW = Date.now();
              const DAY = 86400000;
              const followUps = leads
                .filter((l) => !["comprou", "perdido"].includes(l.stage ?? ""))
                .map((l) => {
                  const last = l.last_contact_at ? new Date(l.last_contact_at).getTime() : null;
                  const days = last ? Math.floor((NOW - last) / DAY) : null;
                  return { lead: l, days };
                })
                .filter((x) => x.days === null || x.days >= 3)
                .sort((a, b) => (b.days ?? 999) - (a.days ?? 999))
                .slice(0, 5);
              if (followUps.length === 0) {
                return <div className="p-6 text-center text-sm text-muted-foreground">Tudo em dia. Nenhum follow-up atrasado. ✅</div>;
              }
              return (
                <ul className="divide-y divide-border/60">
                  {followUps.map(({ lead: l, days }) => {
                    const tone =
                      days === null ? "bg-destructive/10 text-destructive border-destructive/20"
                      : days >= 7 ? "bg-destructive/10 text-destructive border-destructive/20"
                      : "bg-warning/10 text-warning border-warning/20";
                    const label = days === null ? "Sem contato" : `${days}d sem contato`;
                    return (
                      <li key={l.id}>
                        <Link to={`/conversas?lead=${l.id}`} className="flex w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 md:px-5">
                          <div className="shrink-0"><InitialsAvatar name={l.name ?? "?"} /></div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2 min-w-0">
                              <span className="truncate text-sm font-semibold">{l.name ?? l.phone}</span>
                              <span className={`shrink-0 inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${tone}`}>{label}</span>
                            </div>
                            <p className="truncate text-xs text-muted-foreground capitalize">{l.stage ?? "novo"} · {l.phone ?? "—"}</p>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              );
            })()}
          </div>
        </section>
      </div>
    </>
  );
}

function ActionPill({ label, badge, tone, to }: { label: string; badge: number; tone: "destructive" | "warning" | "info" | "success"; to: string }) {
  const tones = {
    destructive: "border-destructive/15 bg-destructive/5 text-destructive shadow-[0_4px_14px_-8px_hsl(var(--destructive)/0.4)]",
    warning: "border-warning/20 bg-warning/10 text-warning shadow-[0_4px_14px_-8px_hsl(var(--warning)/0.4)]",
    info: "border-info/15 bg-info/10 text-info shadow-[0_4px_14px_-8px_hsl(var(--info)/0.4)]",
    success: "border-success/15 bg-success/10 text-success shadow-[0_4px_14px_-8px_hsl(var(--success)/0.4)]",
  };
  const badgeTones = {
    destructive: "bg-destructive text-destructive-foreground",
    warning: "bg-warning text-warning-foreground",
    info: "bg-info text-info-foreground",
    success: "bg-success text-success-foreground",
  };
  return (
    <Link to={to} className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all hover:-translate-y-0.5 ${tones[tone]}`}>
      {label}
      {badge > 0 && <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${badgeTones[tone]}`}>{badge}</span>}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}
