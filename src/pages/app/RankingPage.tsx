import { useMemo, useState } from "react";
const motion = { div: (props: any) => <div {...props} /> } as any;
import { Trophy, Medal, Flame, Target, TrendingUp, Users, Clock, DollarSign, Calendar, MessageCircle, Award, AlertTriangle } from "lucide-react";
import { RankCard } from "@/components/gamification/RankCard";
import { PublicLeaderboard } from "@/components/gamification/PublicLeaderboard";
import { PrizesBanner } from "@/components/gamification/PrizesBanner";
import { EloLadder } from "@/components/gamification/EloLadder";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { cn } from "@/lib/utils";
import { formatCurrency, timeAgo } from "@/lib/format";
import { useEffectiveRole } from "@/hooks/useEffectiveRole";
import { usePermissions } from "@/hooks/usePermissions";
import { useActiveMember } from "@/contexts/ActiveMemberContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  useRanking, useMyGamificationSummary, useTeamOverview, useExecutiveOverview,
  useGamificationConfig, levelFor, type Period, type RankingRow,
} from "@/hooks/useGamification";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as RTooltip,
  CartesianGrid, BarChart, Bar,
} from "recharts";

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "daily", label: "Hoje" },
  { value: "weekly", label: "Semana" },
  { value: "monthly", label: "Mês" },
  { value: "all", label: "Geral" },
];

function PeriodTabs({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="inline-flex items-center rounded-xl border bg-card p-1 shadow-sm">
      {PERIOD_OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
            value === o.value ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function KpiTile({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string | number; accent?: string }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", accent ?? "bg-primary/10 text-primary")}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="font-display text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </Card>
  );
}

function MedalIcon({ position }: { position: number }) {
  const map: Record<number, { bg: string; color: string; label: string }> = {
    1: { bg: "bg-yellow-100", color: "text-yellow-600", label: "1º" },
    2: { bg: "bg-slate-100", color: "text-slate-500", label: "2º" },
    3: { bg: "bg-orange-100", color: "text-orange-600", label: "3º" },
  };
  const cfg = map[position];
  if (!cfg) {
    return <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">{position}º</span>;
  }
  return (
    <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-full", cfg.bg)}>
      <Medal className={cn("h-4 w-4", cfg.color)} />
    </span>
  );
}

function TopThree({ rows }: { rows: RankingRow[] }) {
  const top = rows.slice(0, 3);
  while (top.length < 3) top.push(null as any);
  const order = [top[1], top[0], top[2]]; // 2,1,3 visualmente
  const heights = ["h-32", "h-40", "h-28"];
  const positions = [2, 1, 3];
  // 1=gold, 2=prata, 3=bronze
  const podiumStyles: Record<number, string> = {
    1: "bg-gradient-to-b from-yellow-300 via-yellow-200 to-yellow-50 ring-1 ring-yellow-400/50 shadow-[0_-4px_20px_-6px_rgba(234,179,8,0.45)]",
    2: "bg-gradient-to-b from-slate-300 via-slate-200 to-slate-50 ring-1 ring-slate-400/50 shadow-[0_-4px_20px_-6px_rgba(148,163,184,0.45)]",
    3: "bg-gradient-to-b from-orange-300 via-orange-200 to-orange-50 ring-1 ring-orange-400/50 shadow-[0_-4px_20px_-6px_rgba(234,88,12,0.4)]",
  };
  return (
    <div className="grid grid-cols-3 gap-3 md:gap-4">
      {order.map((r, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08 }}
          className="flex flex-col items-center justify-end"
        >
          {r ? (
            <>
              <UserAvatar userId={r.member_id} name={r.display_name} avatarUrl={r.avatar_url} avatarColor={r.avatar_color ?? undefined} size={positions[i] === 1 ? 64 : 48} />
              <div className="mt-1 text-center text-xs font-semibold text-foreground line-clamp-1">{r.display_name}</div>
              <div className="text-[10px] text-muted-foreground">{r.points} pts</div>
            </>
          ) : (
            <div className="text-[10px] text-muted-foreground">—</div>
          )}
          <div className={cn("mt-2 w-full rounded-t-xl px-2 pb-2 pt-3 text-center", heights[i], podiumStyles[positions[i]])}>
            <MedalIcon position={positions[i]} />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function RankList({ rows }: { rows: RankingRow[] }) {
  return (
    <Card className="divide-y overflow-hidden">
      {rows.map((r, i) => (
        <div key={r.member_id} className="flex items-center gap-3 p-3">
          <MedalIcon position={i + 1} />
          <UserAvatar userId={r.member_id} name={r.display_name} avatarUrl={r.avatar_url} avatarColor={r.avatar_color ?? undefined} size={40} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{r.display_name}</div>
            <div className="text-[11px] text-muted-foreground">{r.sales} vendas · {r.meetings} reuniões · {r.contacts} contatos</div>
          </div>
          <div className="text-right">
            <div className="font-display text-base font-semibold tabular-nums text-foreground">{r.points}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">pts</div>
          </div>
        </div>
      ))}
      {rows.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Sem dados no período.</div>}
    </Card>
  );
}

/* ---------------- CONSULTOR ---------------- */
function ConsultorView() {
  const [period, setPeriod] = useState<Period>("monthly");
  const { data: summary } = useMyGamificationSummary(period);
  const { data: ranking = [] } = useRanking(period);
  const { data: config } = useGamificationConfig();
  const { user } = useAuth();
  const { member } = useActiveMember();
  const myId = member?.id ?? user?.id;

  const points = summary?.points ?? 0;
  const { current, next, progress } = useMemo(() => levelFor(points, config), [points, config]);
  const commission = (summary?.sales ?? 0) * (config?.commission_per_sale ?? 0);
  const conversion = summary && summary.leads_assumed > 0 ? Math.round((summary.sales / summary.leads_assumed) * 100) : 0;

  const motivational = useMemo(() => {
    if (!summary) return null;
    if (summary.rank_position === 1 && summary.total_members > 1) return "🏆 Você está em 1º lugar! Mantenha o ritmo.";
    if (summary.rank_position > 0 && summary.rank_position <= 3) return `🥇 Você está em ${summary.rank_position}º lugar — top 3!`;
    if (summary.sales === 0) return "🚀 Feche a primeira venda do período e dispare no ranking.";
    return `Faltam pouco para subir uma posição. Continue!`;
  }, [summary]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold">Meu desempenho</h1>
        <PeriodTabs value={period} onChange={setPeriod} />
      </div>

      <RankCard variant="full" period={period} />

      <EloLadder variant="full" period={period} />


      {motivational && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Card className="border-primary/30 bg-primary/5 p-4 text-sm font-medium text-foreground">{motivational}</Card>
        </motion.div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile icon={Users} label="Leads assumidos" value={summary?.leads_assumed ?? 0} />
        <KpiTile icon={MessageCircle} label="Contatos" value={summary?.contacts ?? 0} />
        <KpiTile icon={Calendar} label="Reuniões" value={summary?.meetings ?? 0} />
        <KpiTile icon={Trophy} label="Vendas" value={summary?.sales ?? 0} accent="bg-emerald-100 text-emerald-700" />
        <KpiTile icon={TrendingUp} label="Conversão" value={`${conversion}%`} />
        <KpiTile icon={Clock} label="Resp. rápidas" value={summary?.fast_responses ?? 0} />
        <KpiTile icon={Flame} label="Bônus pontos" value={(summary?.fast_responses ?? 0) * (config?.points_fast_response_bonus ?? 0)} accent="bg-orange-100 text-orange-600" />
        <KpiTile icon={DollarSign} label="Comissão estimada" value={formatCurrency(commission)} accent="bg-emerald-100 text-emerald-700" />
      </div>

      <PrizesBanner />

      <div>
        <h2 className="mb-3 font-display text-lg font-semibold">Ranking</h2>
        <TopThree rows={ranking} />
        <div className="mt-4">
          <PublicLeaderboard rows={ranking} config={config} highlightMemberId={myId} />
        </div>
        {myId && !ranking.some((r) => r.member_id === myId) && (
          <p className="mt-2 text-xs text-muted-foreground">Seu desempenho aparece no ranking assim que você tiver pontos no período.</p>
        )}
      </div>
    </div>
  );
}

/* ---------------- SUPERVISOR ---------------- */
function SupervisorView() {
  const [period, setPeriod] = useState<Period>("weekly");
  const { data: team = [] } = useTeamOverview(period);
  const { data: ranking = [] } = useRanking(period);
  const { data: config } = useGamificationConfig();

  const offlineCount = team.filter((m) => !m.last_seen_at || (Date.now() - new Date(m.last_seen_at).getTime()) > 30 * 60_000).length;
  const stalledTotal = team.reduce((acc, m) => acc + Number(m.stalled_leads ?? 0), 0);
  const topPerformer = team[0];
  const lowPerformer = [...team].reverse().find((m) => m.points === 0 && m.active_leads > 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold">Ranking da Equipe</h1>
        <PeriodTabs value={period} onChange={setPeriod} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile icon={Users} label="Consultores ativos" value={team.length} />
        <KpiTile icon={AlertTriangle} label="Offline (>30min)" value={offlineCount} accent="bg-amber-100 text-amber-700" />
        <KpiTile icon={AlertTriangle} label="Leads parados >48h" value={stalledTotal} accent="bg-red-100 text-red-700" />
        <KpiTile icon={Trophy} label="Top performer" value={topPerformer?.display_name?.split(" ")[0] ?? "—"} accent="bg-emerald-100 text-emerald-700" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <RankCard variant="full" period={period} />
        <div>
          <h2 className="mb-3 font-display text-base font-semibold tracking-tight">Top 3 destaques</h2>
          <TopThree rows={ranking} />
        </div>
      </div>

      <EloLadder variant="full" period={period} />

      <PrizesBanner />

      <PublicLeaderboard rows={ranking} config={config} />

      {lowPerformer && (
        <Card className="border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          ⚠️ <b>{lowPerformer.display_name}</b> está com {lowPerformer.active_leads} leads ativos e 0 pontos no período. Avalie suporte ou redistribuição.
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="grid grid-cols-12 border-b bg-muted/30 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <div className="col-span-4">Consultor</div>
          <div className="col-span-1 text-right">Pts</div>
          <div className="col-span-1 text-right">Vendas</div>
          <div className="col-span-1 text-right">Reun.</div>
          <div className="col-span-1 text-right">Cont.</div>
          <div className="col-span-1 text-right">Ativos</div>
          <div className="col-span-1 text-right">Parados</div>
          <div className="col-span-2 text-right">Última atividade</div>
        </div>
        {team.map((m, i) => {
          const isOffline = !m.last_seen_at || (Date.now() - new Date(m.last_seen_at).getTime()) > 30 * 60_000;
          return (
            <div key={m.member_id} className="grid grid-cols-12 items-center border-b px-4 py-2.5 text-sm last:border-0 hover:bg-muted/30">
              <div className="col-span-4 flex items-center gap-2">
                <MedalIcon position={i + 1} />
                <UserAvatar userId={m.member_id} name={m.display_name} avatarColor={m.avatar_color ?? undefined} size={28} />
                <div className="min-w-0">
                  <div className="truncate font-medium">{m.display_name}</div>
                  <div className="text-[10px] text-muted-foreground">{m.role_label ?? "Consultor"}</div>
                </div>
              </div>
              <div className="col-span-1 text-right font-semibold tabular-nums">{m.points}</div>
              <div className="col-span-1 text-right tabular-nums">{m.sales}</div>
              <div className="col-span-1 text-right tabular-nums">{m.meetings}</div>
              <div className="col-span-1 text-right tabular-nums">{m.contacts}</div>
              <div className="col-span-1 text-right tabular-nums">{m.active_leads}</div>
              <div className={cn("col-span-1 text-right tabular-nums", Number(m.stalled_leads) > 0 && "text-red-600")}>{m.stalled_leads}</div>
              <div className={cn("col-span-2 text-right text-xs", isOffline ? "text-amber-700" : "text-muted-foreground")}>
                {m.last_seen_at ? timeAgo(m.last_seen_at) : "nunca"}
              </div>
            </div>
          );
        })}
        {team.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Sem consultores cadastrados.</div>}
      </Card>
    </div>
  );
}

/* ---------------- EXECUTIVO ---------------- */
const STAGE_LABELS_PT: Record<string, string> = {
  novo: "Novo lead",
  qualificado: "Qualificado",
  agendado: "Agendado",
  compareceu: "Compareceu",
  comprou: "Comprou",
  perdido: "Perdido",
};

function ExecKpiCard({
  icon: Icon, label, value, hint, tone = "default", highlight = false,
}: {
  icon: any; label: string; value: string | number; hint?: string;
  tone?: "default" | "primary" | "success" | "warning" | "info"; highlight?: boolean;
}) {
  const tones: Record<string, { bar: string; iconWrap: string; ring: string }> = {
    default: { bar: "bg-muted-foreground/30", iconWrap: "bg-muted text-muted-foreground", ring: "ring-border" },
    primary: { bar: "bg-primary", iconWrap: "bg-primary/10 text-primary", ring: "ring-primary/20" },
    success: { bar: "bg-[hsl(var(--success))]", iconWrap: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]", ring: "ring-[hsl(var(--success))]/20" },
    warning: { bar: "bg-[hsl(var(--warning))]", iconWrap: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]", ring: "ring-[hsl(var(--warning))]/20" },
    info:    { bar: "bg-[hsl(var(--info))]",    iconWrap: "bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]",       ring: "ring-[hsl(var(--info))]/20" },
  };
  const t = tones[tone];
  return (
    <Card className={cn("group relative overflow-hidden p-4 transition-all hover:-translate-y-0.5 hover:shadow-md", highlight && "ring-1", highlight && t.ring)}>
      <span className={cn("absolute inset-y-0 left-0 w-1", t.bar)} aria-hidden />
      <div className="flex items-start justify-between gap-3 pl-2">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
          <div className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground tabular-nums md:text-[28px]">{value}</div>
          {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
        </div>
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", t.iconWrap)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}

function ExecutivoView() {
  const [period, setPeriod] = useState<Period>("monthly");
  const { data: overview } = useExecutiveOverview(period);
  const { data: ranking = [] } = useRanking(period);
  const { data: config } = useGamificationConfig();

  const totals = overview?.totals;
  const funnelData = overview?.funnel
    ? Object.entries(overview.funnel).map(([k, v]) => ({ stage: STAGE_LABELS_PT[k] ?? k, count: Number(v) }))
    : [];

  const periodLabel = PERIOD_OPTIONS.find((p) => p.value === period)?.label ?? "";
  const convPct = Math.round(Number(overview?.conversion_rate ?? 0) * 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">Painel executivo</div>
          <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Visão Executiva</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Desempenho consolidado da operação · <span className="font-medium text-foreground">{periodLabel}</span>
          </p>
        </div>
        <PeriodTabs value={period} onChange={setPeriod} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <RankCard variant="full" period={period} />
        <div>
          <h2 className="mb-3 font-display text-base font-semibold tracking-tight">Top 3 destaques</h2>
          <TopThree rows={ranking} />
        </div>
      </div>

      <EloLadder variant="full" period={period} />


      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ExecKpiCard icon={DollarSign} label="Receita estimada" value={formatCurrency(Number(overview?.estimated_revenue ?? 0))} hint={`${totals?.sales ?? 0} venda(s) no período`} tone="success" highlight />
        <ExecKpiCard icon={Trophy} label="Vendas" value={totals?.sales ?? 0} tone="primary" />
        <ExecKpiCard icon={Calendar} label="Reuniões" value={totals?.meetings ?? 0} tone="info" />
        <ExecKpiCard icon={TrendingUp} label="Conversão geral" value={`${convPct}%`} hint="leads → vendas" tone={convPct >= 10 ? "success" : convPct >= 3 ? "warning" : "default"} />
        <ExecKpiCard icon={Users} label="Leads no período" value={totals?.leads_total ?? 0} />
        <ExecKpiCard icon={MessageCircle} label="Contatos" value={totals?.contacts ?? 0} />
        <ExecKpiCard icon={Target} label="Leads assumidos" value={totals?.leads_assumed ?? 0} />
        <ExecKpiCard icon={Award} label="Pontos totais" value={totals?.points ?? 0} tone="primary" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b bg-muted/30 px-5 py-3">
            <div>
              <h3 className="font-display text-sm font-semibold">Performance temporal</h3>
              <p className="text-[11px] text-muted-foreground">Vendas e reuniões por dia</p>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" />Vendas</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[hsl(var(--success))]" />Reuniões</span>
            </div>
          </div>
          <div className="h-64 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={overview?.timeseries ?? []} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.6} vertical={false} />
                <XAxis dataKey="day" fontSize={10} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                <YAxis fontSize={10} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} width={28} />
                <RTooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }} />
                <Line type="monotone" dataKey="sales" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} name="Vendas" />
                <Line type="monotone" dataKey="meetings" stroke="hsl(var(--success))" strokeWidth={2.5} dot={false} name="Reuniões" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b bg-muted/30 px-5 py-3">
            <div>
              <h3 className="font-display text-sm font-semibold">Funil de conversão</h3>
              <p className="text-[11px] text-muted-foreground">Volume por estágio do pipeline</p>
            </div>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              {convPct}% conv.
            </span>
          </div>
          <div className="h-64 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.6} horizontal={false} />
                <XAxis type="number" fontSize={10} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="stage" fontSize={11} width={96} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                <RTooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 8, 8, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      <PrizesBanner />

      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Ranking geral</h2>
            <p className="text-xs text-muted-foreground">Top performers da equipe no período · placar público</p>
          </div>
        </div>
        <TopThree rows={ranking} />
        <div className="mt-4">
          <PublicLeaderboard rows={ranking} config={config} />
        </div>
      </section>
    </div>
  );
}

/* ---------------- ROUTER ---------------- */
export default function RankingPage() {
  const { isSuperadmin, isOwner } = useEffectiveRole();
  const { can } = usePermissions();
  const isSupervisor = can("view_team_metrics") && !isOwner && !isSuperadmin;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
      {isOwner || isSuperadmin ? <ExecutivoView /> : isSupervisor ? <SupervisorView /> : <ConsultorView />}
    </div>
  );
}
