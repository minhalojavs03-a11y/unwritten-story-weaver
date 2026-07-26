import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Users, ClipboardList, CalendarDays, Handshake, Target, TrendingDown, Flame } from "lucide-react";
import type { Stage } from "@/data/mock";

type FunnelStage = { key: Stage; stage: string; count: number };

interface Props {
  /** Contagens por etapa (sem "perdido"). */
  funnel: FunnelStage[];
  /** Total de leads desqualificados no período. */
  lost?: number;
  title?: string;
  subtitle?: string;
  /** Metas ideais em % sobre o total de leads. */
  goals?: { simulacoes: number; reunioes: number; fechados: number };
  className?: string;
}

const DEFAULT_GOALS = { simulacoes: 70, reunioes: 30, fechados: 4 };

export function MetaFunnel({
  funnel,
  lost = 0,
  title = "Funil de Vendas · Meta",
  subtitle = "Realizado x Ideal x Defasagem",
  goals = DEFAULT_GOALS,
  className,
}: Props) {
  const at = (k: Stage) => funnel.find((f) => f.key === k)?.count ?? 0;

  // Etapas cumulativas: quem chegou na reunião também passou pela simulação.
  const fechados = at("comprou");
  const reunioes = at("compareceu") + fechados;
  const simulacoes = at("agendado") + reunioes;
  const leads = at("novo") + at("qualificado") + simulacoes + lost;

  const rows = [
    {
      n: "01",
      label: "Leads / Clientes",
      icon: Users,
      real: leads,
      idealPct: 100,
      tone: "hsl(var(--stage-new))",
      width: 100,
    },
    {
      n: "02",
      label: "Simulações encaminhadas",
      icon: ClipboardList,
      real: simulacoes,
      idealPct: goals.simulacoes,
      tone: "hsl(var(--info))",
      width: 82,
    },
    {
      n: "03",
      label: "Reuniões agendadas",
      icon: CalendarDays,
      real: reunioes,
      idealPct: goals.reunioes,
      tone: "hsl(262 83% 58%)",
      width: 62,
    },
    {
      n: "04",
      label: "Clientes fechados",
      icon: Handshake,
      real: fechados,
      idealPct: goals.fechados,
      tone: "hsl(var(--success))",
      width: 42,
    },
  ].map((r) => {
    const ideal = Math.round((leads * r.idealPct) / 100);
    const realPct = leads > 0 ? (r.real / leads) * 100 : 0;
    return {
      ...r,
      ideal,
      realPct,
      gap: r.real - ideal,
      gapPp: realPct - r.idealPct,
    };
  });

  const fmtPct = (v: number) =>
    `${v.toLocaleString("pt-BR", { minimumFractionDigits: v % 1 === 0 ? 0 : 1, maximumFractionDigits: 1 })}%`;

  const bottleneck = rows
    .slice(1)
    .reduce((worst, r) => (r.gapPp < worst.gapPp ? r : worst), rows[1] ?? rows[0]);

  return (
    <Card className={cn("overflow-hidden p-4 md:p-5", className)}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
          <span className="rounded-md bg-success/10 px-2 py-1 text-success">Realizado</span>
          <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">Ideal</span>
          <span className="rounded-md bg-destructive/10 px-2 py-1 text-destructive">Defasagem</span>
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((r) => {
          const Icon = r.icon;
          const behind = r.gap < 0;
          return (
            <div
              key={r.n}
              className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(64px,84px))] items-center gap-2 rounded-xl border bg-muted/30 p-2 md:gap-3"
            >
              {/* Etapa + barra proporcional (formato de funil) */}
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 rounded-full bg-background px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground ring-1 ring-border">
                  {r.n}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: r.tone }} />
                    <span className="truncate text-xs font-semibold">{r.label}</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-background">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${r.width}%`, backgroundColor: r.tone }}
                    />
                  </div>
                </div>
              </div>

              {/* Realizado */}
              <div className="text-center">
                <div className="font-mono text-lg font-bold tabular-nums leading-none">{r.real}</div>
                <div className="mt-1 text-[10px] font-semibold text-success">{fmtPct(r.realPct)}</div>
              </div>

              {/* Ideal */}
              <div className="text-center">
                <div className="font-mono text-lg font-bold tabular-nums leading-none text-muted-foreground">
                  {r.ideal}
                </div>
                <div className="mt-1 text-[10px] font-semibold text-muted-foreground">{fmtPct(r.idealPct)}</div>
              </div>

              {/* Defasagem */}
              <div className="text-center">
                {r.n === "01" ? (
                  <>
                    <div className="font-mono text-lg font-bold leading-none text-muted-foreground">—</div>
                    <div className="mt-1 text-[10px] font-semibold text-muted-foreground">0%</div>
                  </>
                ) : (
                  <>
                    <div
                      className={cn(
                        "font-mono text-lg font-bold tabular-nums leading-none",
                        behind ? "text-destructive" : "text-success",
                      )}
                    >
                      {r.gap > 0 ? `+${r.gap}` : r.gap}
                    </div>
                    <div
                      className={cn(
                        "mt-1 text-[10px] font-semibold",
                        behind ? "text-destructive" : "text-success",
                      )}
                    >
                      {r.gapPp > 0 ? "+" : ""}
                      {r.gapPp.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border bg-muted/30 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-destructive">
            <TrendingDown className="h-3.5 w-3.5" /> Principal gargalo
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {leads > 0 ? bottleneck.label : "Sem leads no período"}
          </p>
        </div>
        <div className="rounded-xl border bg-muted/30 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-info">
            <Target className="h-3.5 w-3.5" /> Nossa meta
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {goals.simulacoes}% simulações · {goals.reunioes}% reuniões · {goals.fechados}% fechamentos
          </p>
        </div>
        <div className="rounded-xl border bg-muted/30 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-success">
            <Flame className="h-3.5 w-3.5" /> Foco diário
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Mais simulações, mais reuniões, mais fechamentos.
          </p>
        </div>
      </div>
    </Card>
  );
}
