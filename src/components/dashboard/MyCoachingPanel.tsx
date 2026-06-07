import { Link } from "react-router-dom";
import { Sparkles, AlertTriangle, Mic, ArrowRight, FileCheck2 } from "lucide-react";
import { useCoachingInsights } from "@/hooks/useCoachingInsights";

export function MyCoachingPanel({ memberId, days = 30 }: { memberId: string; days?: number }) {
  const { data: insights = [], isLoading } = useCoachingInsights({ memberId, days });

  const totals = insights.reduce(
    (acc, i) => {
      if (i.insight_type === "simulation_sent") acc.sims += 1;
      else {
        acc.total += 1;
        if (i.severity === "high") acc.high += 1;
        if (i.insight_type === "missed_buying_signal") acc.missed += 1;
        if (i.insight_type === "should_be_audio") acc.audio += 1;
      }
      return acc;
    },
    { total: 0, high: 0, missed: 0, audio: 0, sims: 0 },
  );

  const recent = insights.filter((i) => i.insight_type !== "simulation_sent").slice(0, 4);

  return (
    <div className="client-card rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3 md:px-5 md:py-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="font-display text-base font-semibold tracking-tight md:text-lg">
            Seu coaching IA
          </h2>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            · {days}d
          </span>
        </div>
        <Link to="/coaching" className="shrink-0 text-xs font-medium text-primary hover:underline">
          Ver tudo →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-border/60 px-4 py-3 md:grid-cols-4 md:px-5">
        <Metric label="Alertas abertos" value={totals.total} tone="default" />
        <Metric label="Sinal perdido" value={totals.missed} tone="red" icon={AlertTriangle} />
        <Metric label="Devia ser áudio" value={totals.audio} tone="amber" icon={Mic} />
        <Metric label="Simulações" value={totals.sims} tone="emerald" icon={FileCheck2} />
      </div>

      {isLoading ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground md:px-5">
          Carregando análises…
        </div>
      ) : recent.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground md:px-5">
          Nenhum alerta aberto. Seu atendimento está alinhado. 🎯
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {recent.map((i) => (
            <li key={i.id}>
              <Link
                to={i.lead_id ? `/conversas?lead=${i.lead_id}` : "/coaching"}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40 md:px-5"
              >
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/40">
                  {i.insight_type === "should_be_audio" ? (
                    <Mic className="h-4 w-4 text-amber-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{i.title}</p>
                  {i.lead?.name && (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      Lead: {i.lead.name}
                    </p>
                  )}
                </div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: "default" | "red" | "amber" | "emerald";
  icon?: any;
}) {
  const color =
    tone === "red"
      ? "text-red-600"
      : tone === "amber"
        ? "text-amber-600"
        : tone === "emerald"
          ? "text-emerald-600"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className={`mt-0.5 font-display text-xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
