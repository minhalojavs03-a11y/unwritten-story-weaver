import { useMemo, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Crown, BarChart3, UserCircle2, TrendingUp, TrendingDown, Users, Target, DollarSign, Activity, AlertTriangle, Trophy, Clock, Filter, Heart, Sparkles, Zap, Flame, Award, Gauge } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InitialsAvatar } from "@/components/oticaflow/Avatar";
import { useLeads, useTenantMembers } from "@/hooks/useData";
import { useActiveMember } from "@/contexts/ActiveMemberContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useEffectiveRole } from "@/hooks/useEffectiveRole";
import { stageLabels, stageOrder, stageColorClass, type Stage } from "@/data/mock";
import { cn } from "@/lib/utils";
import { useReportData, type Period, PERIOD_LABELS, fmtBRL, fmtPct } from "@/hooks/useReportData";
import {
  CHART_COLORS, SectionTitle, ChartTooltip,
  HealthScore, InsightsPanel, PipelineIntel, WeeklyActivity, ResponseHeatmap,
} from "@/components/dashboard/ExecutiveWidgets";
import { ResponseRatePanel } from "@/components/dashboard/ResponseRatePanel";


// ─── Building blocks ────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, trend, icon: Icon, tone = "default" }: {
  label: string; value: string | number; sub?: string; trend?: number;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "default" | "primary" | "success" | "warning" | "danger";
}) {
  const tones: Record<string, { bar: string; iconWrap: string; ring: string }> = {
    default: { bar: "bg-muted-foreground/30", iconWrap: "bg-muted text-muted-foreground", ring: "ring-border" },
    primary: { bar: "bg-primary", iconWrap: "bg-primary/10 text-primary", ring: "ring-primary/20" },
    success: { bar: "bg-[hsl(var(--success))]", iconWrap: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]", ring: "ring-[hsl(var(--success))]/20" },
    warning: { bar: "bg-[hsl(var(--warning))]", iconWrap: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]", ring: "ring-[hsl(var(--warning))]/20" },
    danger:  { bar: "bg-[hsl(var(--destructive))]", iconWrap: "bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]", ring: "ring-[hsl(var(--destructive))]/20" },
  };
  const t = tones[tone];
  const highlight = tone !== "default";
  return (
    <Card className={cn("group relative overflow-hidden p-4 transition-all hover:-translate-y-0.5 hover:shadow-md", highlight && "ring-1", highlight && t.ring)}>
      <span className={cn("absolute inset-y-0 left-0 w-1", t.bar)} aria-hidden />
      <div className="flex items-start justify-between gap-3 pl-2">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
          <div className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground tabular-nums md:text-[28px]">{value}</div>
          {(sub || trend !== undefined) && (
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {trend !== undefined && (
                <span className={cn("inline-flex items-center gap-0.5 font-semibold", trend >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--destructive))]")}>
                  {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {trend >= 0 ? "+" : ""}{trend.toFixed(1)}%
                </span>
              )}
              {sub && <span>{sub}</span>}
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", t.iconWrap)}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
    </Card>
  );
}


function ProgressBar({ value, max = 100, tone = "primary" }: { value: number; max?: number; tone?: "primary" | "success" | "warning" | "danger" }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const bg = { primary: "bg-primary", success: "bg-emerald-500", warning: "bg-amber-500", danger: "bg-rose-500" }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full transition-all", bg)} style={{ width: `${pct}%` }} />
    </div>
  );
}


// ─── Filter bar ─────────────────────────────────────────────────────────────
function FilterBar({ period, setPeriod, members, memberFilter, setMemberFilter, showMember }: {
  period: Period; setPeriod: (p: Period) => void;
  members: { id: string; display_name: string }[];
  memberFilter: string; setMemberFilter: (v: string) => void;
  showMember: boolean;
}) {
  const periods: Period[] = ["today", "7d", "30d", "month", "year", "all"];
  return (
    <Card className="flex flex-wrap items-center gap-2 p-3">
      <div className="flex items-center gap-1.5 pr-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Filter className="h-3.5 w-3.5" /> Período
      </div>
      <div className="flex flex-wrap gap-1">
        {periods.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              period === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
            )}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>
      {showMember && (
        <div className="ml-auto">
          <Select value={memberFilter} onValueChange={setMemberFilter}>
            <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue placeholder="Todos os consultores" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os consultores</SelectItem>
              {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
    </Card>
  );
}

// useReportData + executive widgets moved to @/hooks/useReportData and @/components/dashboard/ExecutiveWidgets




// ─── Owner Dashboard ────────────────────────────────────────────────────────
function OwnerDashboard({ data }: { data: ReturnType<typeof useReportData> }) {
  const topCampaigns = data.campaigns.slice(0, 6);
  const totalCampaignLeads = Math.max(1, topCampaigns.reduce((s, c) => s + c.leads, 0));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Receita" value={fmtBRL(data.revenue)} sub={`${data.won} vendas`} icon={DollarSign} tone="success" />
        <KpiCard label="Leads" value={data.total} sub="no período" icon={Users} />
        <KpiCard label="Conversão" value={`${data.convRate.toFixed(1)}%`} sub={`${data.won}/${data.total}`} icon={Target} tone={data.convRate >= 15 ? "success" : "warning"} />
        <KpiCard label="Ticket médio" value={fmtBRL(data.avgTicket)} sub="por venda fechada" icon={Activity} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <SectionTitle title="Receita mensal" sub="Últimos 12 meses (vendas fechadas)" />
          <div className="h-72">
            <ResponsiveContainer>
              <AreaChart data={data.monthly}>
                <defs>
                  <linearGradient id="grad-rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" stroke={CHART_COLORS.muted} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke={CHART_COLORS.muted} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => fmtBRL(v)} />
                <Tooltip content={<ChartTooltip formatter={(v: number) => fmtBRL(v)} />} />
                <Area type="monotone" dataKey="revenue" name="Receita" stroke={CHART_COLORS.primary} strokeWidth={2} fill="url(#grad-rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <PipelineIntel pipeline={data.pipelineIntel} total={data.total} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2"><HealthScore score={data.healthScore} dims={data.healthDims} /></div>
        <div className="lg:col-span-3"><InsightsPanel insights={data.insights} /></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <WeeklyActivity weekly={data.weekly} />
        <ResponseHeatmap heatmap={data.responseHeatmap} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Performance por origem" sub="Leads e receita por canal" />
          {topCampaigns.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sem dados de origem no período.</p>
          ) : (
            <div className="space-y-3">
              {topCampaigns.map((c) => (
                <div key={c.name} className="flex items-center gap-3">
                  <div className="w-28 truncate text-sm font-medium">{c.name}</div>
                  <div className="flex-1">
                    <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                      <span>{c.leads} leads · {c.won} vendas</span>
                      <span className="font-semibold text-foreground">{fmtBRL(c.revenue)}</span>
                    </div>
                    <ProgressBar value={c.leads} max={totalCampaignLeads} />
                  </div>
                  <Badge variant={c.conv >= 15 ? "default" : "secondary"} className="shrink-0 text-[10px]">
                    {c.conv.toFixed(0)}%
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle title="Motivos de perda" sub={`${data.lost} leads perdidos no período`} />
          {data.lostReasons.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sem leads perdidos no período.</p>
          ) : (
            <div className="space-y-3">
              {data.lostReasons.map((r) => (
                <div key={r.reason}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-medium">{r.reason}</span>
                    <span className="text-muted-foreground">{r.count} ({r.pct.toFixed(0)}%)</span>
                  </div>
                  <ProgressBar value={r.pct} tone="danger" />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle title="Ranking de consultores" sub="Por receita gerada no período" action={<Badge variant="secondary">{data.memberStats.length} ativos</Badge>} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="w-8 py-2">#</th>
                <th className="py-2">Consultor</th>
                <th className="py-2 text-right">Leads</th>
                <th className="py-2 text-right">Fechados</th>
                <th className="py-2 text-right">Conversão</th>
                <th className="py-2 text-right">Receita</th>
                <th className="py-2 text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {[...data.memberStats].sort((a, b) => b.revenue - a.revenue).map((m, i) => (
                <tr key={m.id} className="border-b border-border/50 transition-colors hover:bg-muted/40">
                  <td className="py-2.5">
                    <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold",
                      i === 0 ? "bg-amber-500/15 text-amber-600" : i < 3 ? "bg-primary/10 text-primary" : "text-muted-foreground")}>
                      {i + 1}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <InitialsAvatar name={m.name} className="h-8 w-8 text-xs" />
                      <div>
                        <div className="font-medium">{m.name}</div>
                        <div className="text-[11px] text-muted-foreground">{m.role}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{m.leads}</td>
                  <td className="py-2.5 text-right tabular-nums font-semibold">{m.closed}</td>
                  <td className="py-2.5 text-right tabular-nums">
                    <span className={cn(m.conv >= 15 ? "text-emerald-600" : m.conv > 0 ? "text-amber-600" : "text-muted-foreground")}>
                      {m.conv.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-2.5 text-right tabular-nums font-semibold">{fmtBRL(m.revenue)}</td>
                  <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                    {m.avgResp > 0 ? `${m.avgResp.toFixed(1)}h` : "—"}
                  </td>
                </tr>
              ))}
              {data.memberStats.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Sem consultores cadastrados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── Supervisor Dashboard ───────────────────────────────────────────────────
function SupervisorDashboard({ data }: { data: ReturnType<typeof useReportData> }) {
  const alerts = useMemo(() => {
    const out: { type: "danger" | "warning" | "info"; msg: string }[] = [];
    data.memberStats.forEach((m) => {
      if (m.uncontacted >= 10) out.push({ type: "danger", msg: `${m.name}: ${m.uncontacted} leads sem primeiro contato` });
      else if (m.uncontacted >= 5) out.push({ type: "warning", msg: `${m.name}: ${m.uncontacted} leads sem primeiro contato` });
      if (m.avgResp > 8) out.push({ type: "warning", msg: `${m.name}: tempo de resposta médio de ${m.avgResp.toFixed(1)}h` });
    });
    if (out.length === 0) out.push({ type: "info", msg: "Tudo em dia! Nenhum alerta crítico no período." });
    return out.slice(0, 6);
  }, [data.memberStats]);

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <SectionTitle title="Central de alertas" sub="Itens que precisam de atenção" />
        <div className="space-y-2">
          {alerts.map((a, i) => {
            const tone = a.type === "danger" ? "border-rose-500/30 bg-rose-500/5 text-rose-600"
              : a.type === "warning" ? "border-amber-500/30 bg-amber-500/5 text-amber-600"
              : "border-emerald-500/30 bg-emerald-500/5 text-emerald-600";
            return (
              <div key={i} className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-sm", tone)}>
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="flex-1 text-foreground">{a.msg}</span>
                <Badge variant="outline" className="text-[10px] uppercase">{a.type}</Badge>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Time" value={data.memberStats.length} sub="consultores ativos" icon={Users} />
        <KpiCard label="Leads atendidos" value={data.contacted} sub={`${data.total} no total`} icon={Activity} />
        <KpiCard label="Reuniões" value={data.inMeeting} sub="agendadas ou realizadas" icon={Clock} />
        <KpiCard label="Sem contato" value={data.memberStats.reduce((s, m) => s + m.uncontacted, 0)} sub="aguardando 1º toque" tone="warning" icon={AlertTriangle} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2"><HealthScore score={data.healthScore} dims={data.healthDims} /></div>
        <div className="lg:col-span-3"><InsightsPanel insights={data.insights} /></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PipelineIntel pipeline={data.pipelineIntel} total={data.total} />
        <ResponseHeatmap heatmap={data.responseHeatmap} />
      </div>

      <Card className="p-5">
        <SectionTitle title="Desempenho dos consultores" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="py-2">Consultor</th>
                <th className="py-2 text-right">Leads</th>
                <th className="py-2 text-right">Contatos</th>
                <th className="py-2 text-right">Reuniões</th>
                <th className="py-2 text-right">Fechados</th>
                <th className="py-2 text-right">SLA</th>
                <th className="py-2 text-right">Receita</th>
              </tr>
            </thead>
            <tbody>
              {data.memberStats.map((m) => (
                <tr key={m.id} className="border-b border-border/50 transition-colors hover:bg-muted/40">
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <InitialsAvatar name={m.name} className="h-8 w-8 text-xs" />
                      <div>
                        <div className="font-medium">{m.name}</div>
                        <div className="text-[11px] text-muted-foreground">{m.role}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{m.leads}</td>
                  <td className="py-2.5 text-right tabular-nums">{m.contacted}</td>
                  <td className="py-2.5 text-right tabular-nums">{m.meetings}</td>
                  <td className="py-2.5 text-right tabular-nums font-semibold">{m.closed}</td>
                  <td className="py-2.5 text-right tabular-nums">
                    <span className={cn(m.avgResp === 0 ? "text-muted-foreground" : m.avgResp <= 5 ? "text-emerald-600" : m.avgResp <= 8 ? "text-amber-600" : "text-rose-600")}>
                      {m.avgResp > 0 ? `${m.avgResp.toFixed(1)}h` : "—"}
                    </span>
                  </td>
                  <td className="py-2.5 text-right tabular-nums font-semibold">{fmtBRL(m.revenue)}</td>
                </tr>
              ))}
              {data.memberStats.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Sem consultores no período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle title="Leads sem primeiro contato" sub="Por consultor" />
        {data.memberStats.filter((m) => m.uncontacted > 0).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Todos os leads já receberam contato. 🎉</p>
        ) : (
          <div className="space-y-2.5">
            {data.memberStats.filter((m) => m.uncontacted > 0).sort((a, b) => b.uncontacted - a.uncontacted).map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <InitialsAvatar name={m.name} className="h-8 w-8 text-xs" />
                <span className="w-40 truncate text-sm font-medium">{m.name}</span>
                <div className="flex-1">
                  <ProgressBar value={m.uncontacted} max={Math.max(1, m.leads)} tone={m.uncontacted > 10 ? "danger" : "warning"} />
                </div>
                <span className={cn("w-12 text-right text-sm font-semibold tabular-nums", m.uncontacted > 10 ? "text-rose-600" : "text-amber-600")}>
                  {m.uncontacted}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Personal Dashboard ─────────────────────────────────────────────────────
function PersonalDashboard({ data, memberName }: { data: ReturnType<typeof useReportData>; memberName: string }) {
  const conv = data.convRate;
  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <InitialsAvatar name={memberName} className="h-14 w-14 text-base" />
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-xl font-bold tracking-tight">{memberName || "Meu desempenho"}</h2>
          <p className="text-sm text-muted-foreground">Visão pessoal · {data.total} leads no período</p>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-bold text-emerald-600">{fmtBRL(data.revenue)}</div>
          <div className="text-xs text-muted-foreground">receita gerada</div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Meus leads" value={data.total} sub="no período" icon={Users} />
        <KpiCard label="Reuniões" value={data.inMeeting} sub="agendadas/realizadas" icon={Clock} />
        <KpiCard label="Fechados" value={data.won} sub={`de ${data.total} leads`} icon={Trophy} tone="success" />
        <KpiCard label="Conversão" value={`${conv.toFixed(1)}%`} sub="taxa de fechamento" icon={Target} tone={conv >= 15 ? "success" : "warning"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <SectionTitle title="Minha receita mensal" sub="Últimos 12 meses" />
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={data.monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" stroke={CHART_COLORS.muted} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke={CHART_COLORS.muted} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => fmtBRL(v)} />
                <Tooltip content={<ChartTooltip formatter={(v: number) => fmtBRL(v)} />} cursor={{ fill: "hsl(var(--muted))" }} />
                <Bar dataKey="revenue" name="Receita" radius={[4, 4, 0, 0]}>
                  {data.monthly.map((_, i) => (
                    <Cell key={i} fill={i === data.monthly.length - 1 ? CHART_COLORS.primary : "hsl(var(--primary) / 0.4)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Meu funil" />
          <div className="space-y-2.5">
            {data.funnel.map((s) => {
              const pct = Math.min(100, Math.max(0, (s.count / data.maxStage) * 100));
              return (
                <div key={s.stage}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <span className={cn("h-2 w-2 rounded-full", stageColorClass[s.key])} />
                      {s.stage}
                    </span>
                    <span className="text-muted-foreground">{s.count}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full rounded-full transition-all", stageColorClass[s.key])} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function RelatoriosPage() {
  const { can } = usePermissions();
  const { isOwner, isSuperadmin } = useEffectiveRole();
  const { member } = useActiveMember();
  const { data: members = [] } = useTenantMembers();

  const canViewAll = can("view_all_leads");
  const canViewTeam = can("view_team_metrics");
  const isExecutive = isOwner || isSuperadmin;

  const defaultTab = isExecutive ? "owner" : canViewTeam ? "supervisor" : "personal";
  const [tab, setTab] = useState<string>(defaultTab);
  const [period, setPeriod] = useState<Period>("30d");
  const [memberFilter, setMemberFilter] = useState<string>("all");

  // Owner/supervisor share the global view; personal scopes to active member
  const scopeForPersonal = member?.id ?? null;
  const dataGlobal = useReportData(period, canViewAll ? memberFilter : "all", canViewAll ? null : scopeForPersonal);
  const dataPersonal = useReportData(period, "all", scopeForPersonal);

  const tabs = [
    ...(isExecutive ? [{ id: "owner", label: "Visão executiva", icon: Crown }] : []),
    ...(canViewTeam ? [{ id: "supervisor", label: "Supervisão", icon: BarChart3 }] : []),
    { id: "personal", label: "Meu desempenho", icon: UserCircle2 },
  ];

  return (
    <>
      <PageHeader title="Relatórios & BI" subtitle="Análise de performance, conversão e receita" />
      <div className="space-y-4 px-4 pb-8 md:space-y-5 md:px-8">
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList className="h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
            {tabs.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <FilterBar
            period={period}
            setPeriod={setPeriod}
            members={members.map((m) => ({ id: m.id, display_name: m.display_name }))}
            memberFilter={memberFilter}
            setMemberFilter={setMemberFilter}
            showMember={canViewAll && tab !== "personal"}
          />

          <ResponseRatePanel memberId={memberFilter === "all" ? null : memberFilter} />


          {isExecutive && (
            <TabsContent value="owner" className="mt-0"><OwnerDashboard data={dataGlobal} /></TabsContent>
          )}
          {canViewTeam && (
            <TabsContent value="supervisor" className="mt-0"><SupervisorDashboard data={dataGlobal} /></TabsContent>
          )}
          <TabsContent value="personal" className="mt-0">
            <PersonalDashboard data={dataPersonal} memberName={member?.display_name ?? ""} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
