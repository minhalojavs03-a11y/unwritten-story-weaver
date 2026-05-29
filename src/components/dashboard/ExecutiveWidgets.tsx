import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { AlertTriangle, Heart, Sparkles, Award, Clock, Activity, Flame, Gauge } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { stageColorClass } from "@/data/mock";
import type { ReportData } from "@/hooks/useReportData";

export const CHART_COLORS = {
  primary: "hsl(var(--primary))",
  success: "hsl(142 71% 45%)",
  warning: "hsl(38 92% 50%)",
  danger: "hsl(0 84% 60%)",
  muted: "hsl(var(--muted-foreground))",
  accent: "hsl(217 91% 60%)",
  purple: "hsl(262 83% 58%)",
};

export function SectionTitle({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h3 className="font-display text-base font-semibold tracking-tight">{title}</h3>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function ChartTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      {label && <div className="mb-1 font-semibold">{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold">{formatter ? formatter(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function HealthScore({ score, dims }: { score: number; dims: { name: string; v: number }[] }) {
  const tone = score >= 80 ? "success" : score >= 60 ? "warning" : "danger";
  const label = score >= 80 ? "Operação saudável" : score >= 60 ? "Atenção necessária" : "Estado crítico";
  const toneText: Record<string, string> = {
    success: "text-[hsl(var(--success))]",
    warning: "text-[hsl(var(--warning))]",
    danger: "text-[hsl(var(--destructive))]",
  };
  const toneBar: Record<string, string> = {
    success: "bg-[hsl(var(--success))]",
    warning: "bg-[hsl(var(--warning))]",
    danger: "bg-[hsl(var(--destructive))]",
  };
  const dimTone = (v: number) => (v >= 75 ? "success" : v >= 50 ? "warning" : "danger");
  const r = 52, c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <Card className="p-5">
      <SectionTitle title="Health Score" sub="Saúde operacional em 5 dimensões" action={<Heart className={cn("h-4 w-4", toneText[tone])} />} />
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <div className="relative h-32 w-32 shrink-0">
          <svg viewBox="0 0 120 120" className="-rotate-90">
            <circle cx="60" cy="60" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
            <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={offset} className={cn("transition-all duration-700", toneText[tone])} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-3xl font-bold tabular-nums">{score}</span>
            <span className="text-[10px] font-medium text-muted-foreground">de 100</span>
          </div>
        </div>
        <div className="flex-1">
          <div className={cn("font-display text-base font-bold", toneText[tone])}>{label}</div>
          <p className="text-xs text-muted-foreground">Cálculo baseado em velocidade, follow-up, contato, engajamento e conversão.</p>
        </div>
      </div>
      <div className="mt-5 space-y-2.5">
        {dims.map((d) => {
          const t = dimTone(d.v);
          return (
            <div key={d.name}>
              <div className="mb-1 flex justify-between text-[11px]">
                <span className="font-medium">{d.name}</span>
                <span className={cn("tabular-nums font-semibold", toneText[t])}>{d.v}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full transition-all duration-700", toneBar[t])} style={{ width: `${d.v}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function InsightsPanel({ insights }: { insights: { level: "success" | "warning" | "info"; text: string; tag: string }[] }) {
  const tones: Record<string, { wrap: string; chip: string; icon: string }> = {
    success: { wrap: "border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5", chip: "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]", icon: "text-[hsl(var(--success))]" },
    warning: { wrap: "border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5", chip: "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]", icon: "text-[hsl(var(--warning))]" },
    info:    { wrap: "border-primary/30 bg-primary/5", chip: "bg-primary/10 text-primary", icon: "text-primary" },
  };
  const IconFor = (lvl: string) => lvl === "warning" ? AlertTriangle : lvl === "success" ? Award : Sparkles;
  return (
    <Card className="p-5">
      <SectionTitle title="Insights estratégicos" sub="Sinalizações automáticas extraídas dos dados" action={<Sparkles className="h-4 w-4 text-primary" />} />
      <div className="space-y-2">
        {insights.map((ins, i) => {
          const t = tones[ins.level];
          const I = IconFor(ins.level);
          return (
            <div key={i} className={cn("flex items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-shadow hover:shadow-sm", t.wrap)}>
              <I className={cn("mt-0.5 h-4 w-4 shrink-0", t.icon)} />
              <p className="flex-1 text-xs leading-relaxed text-foreground">{ins.text}</p>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider", t.chip)}>{ins.tag}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function PipelineIntel({ pipeline, total }: { pipeline: ReportData["pipelineIntel"]; total: number }) {
  const max = Math.max(1, ...pipeline.map((p) => p.count));
  return (
    <Card className="p-5">
      <SectionTitle title="Inteligência de pipeline" sub={`${total} leads · dias médios por etapa e conversão entre estágios`} action={<Gauge className="h-4 w-4 text-primary" />} />
      <div className="space-y-3.5">
        {pipeline.map((s) => {
          const pct = Math.min(100, Math.max(0, (s.count / max) * 100));
          return (
            <div key={s.key}>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-2 font-medium">
                  <span className={cn("h-2 w-2 rounded-full", stageColorClass[s.key])} />
                  {s.stage}
                  {s.isBottleneck && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--destructive))]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[hsl(var(--destructive))]">
                      <AlertTriangle className="h-2.5 w-2.5" /> Gargalo
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2 text-muted-foreground tabular-nums">
                  <span>{s.avgDays.toFixed(1)}d médio</span>
                  <span className="font-semibold text-foreground">{s.count}</span>
                  {s.nextPct !== null && <span className="text-[hsl(var(--success))]">→{s.nextPct}%</span>}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full transition-all duration-700", stageColorClass[s.key])} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function WeeklyActivity({ weekly }: { weekly: { d: string; contatos: number; reunioes: number; fechados: number }[] }) {
  return (
    <Card className="p-5">
      <SectionTitle title="Atividade semanal" sub="Últimos 7 dias por dia da semana" action={<Activity className="h-4 w-4 text-primary" />} />
      <div className="h-56">
        <ResponsiveContainer>
          <BarChart data={weekly}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="d" stroke={CHART_COLORS.muted} fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke={CHART_COLORS.muted} fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
            <Bar dataKey="contatos" name="Contatos" fill={CHART_COLORS.primary} radius={[3,3,0,0]} />
            <Bar dataKey="reunioes" name="Reuniões" fill={CHART_COLORS.purple} radius={[3,3,0,0]} />
            <Bar dataKey="fechados" name="Fechados" fill={CHART_COLORS.success} radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
        {[["Contatos", CHART_COLORS.primary], ["Reuniões", CHART_COLORS.purple], ["Fechados", CHART_COLORS.success]].map(([l, c]) => (
          <span key={l} className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: c }} /> {l}
          </span>
        ))}
      </div>
    </Card>
  );
}

export function ResponseHeatmap({ heatmap }: { heatmap: { h: string; avg: number }[] }) {
  const hasData = heatmap.some((b) => b.avg > 0);
  const peak = heatmap.reduce((p, b) => (b.avg > p.avg ? b : p), heatmap[0] ?? { h: "", avg: 0 });
  return (
    <Card className="p-5">
      <SectionTitle
        title="Tempo de resposta por horário"
        sub={hasData ? "Horas médias entre lead criado e primeiro contato" : "Sem dados suficientes no período"}
        action={<Clock className="h-4 w-4 text-primary" />}
      />
      <div className="h-56">
        <ResponsiveContainer>
          <AreaChart data={heatmap}>
            <defs>
              <linearGradient id="grad-resp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLORS.warning} stopOpacity={0.5} />
                <stop offset="100%" stopColor={CHART_COLORS.warning} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="h" stroke={CHART_COLORS.muted} fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke={CHART_COLORS.muted} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}h`} />
            <Tooltip content={<ChartTooltip formatter={(v: number) => `${v}h`} />} />
            <Area type="monotone" dataKey="avg" name="Resposta média" stroke={CHART_COLORS.warning} strokeWidth={2} fill="url(#grad-resp)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {hasData && peak.avg > 6 && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5 px-2.5 py-1.5 text-[11px] text-[hsl(var(--warning))]">
          <Flame className="h-3 w-3" /> Pico de demora às {peak.h} ({peak.avg}h em média)
        </div>
      )}
    </Card>
  );
}
