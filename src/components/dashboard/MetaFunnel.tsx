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

// Geometria do cone
const ROW_H = 86;
const ROW_GAP = 8;
const CONE_W = 300;
const EDGES = [280, 218, 156, 96, 52]; // largura da boca de cada faixa

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
    { n: "01", label: "Leads / Clientes", icon: Users, real: leads, idealPct: 100, tone: "hsl(var(--stage-new))" },
    { n: "02", label: "Simulações encaminhadas", icon: ClipboardList, real: simulacoes, idealPct: goals.simulacoes, tone: "hsl(var(--info))" },
    { n: "03", label: "Reuniões agendadas", icon: CalendarDays, real: reunioes, idealPct: goals.reunioes, tone: "hsl(262 83% 58%)" },
    { n: "04", label: "Clientes fechados", icon: Handshake, real: fechados, idealPct: goals.fechados, tone: "hsl(var(--success))" },
  ].map((r) => {
    const ideal = Math.round((leads * r.idealPct) / 100);
    const realPct = leads > 0 ? (r.real / leads) * 100 : 0;
    return { ...r, ideal, realPct, gap: r.real - ideal, gapPp: realPct - r.idealPct };
  });

  const fmtPct = (v: number) =>
    `${v.toLocaleString("pt-BR", { minimumFractionDigits: v % 1 === 0 ? 0 : 1, maximumFractionDigits: 1 })}%`;

  const bottleneck = rows.slice(1).reduce((worst, r) => (r.gapPp < worst.gapPp ? r : worst), rows[1]);
  const svgH = ROW_H * rows.length + ROW_GAP * (rows.length - 1);

  return (
    <Card className={cn("overflow-hidden p-4 md:p-6", className)}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
          <span className="rounded-md bg-success/10 px-2 py-1 text-success">Realizado</span>
          <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">Ideal (meta)</span>
          <span className="rounded-md bg-destructive/10 px-2 py-1 text-destructive">Defasagem</span>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Cone do funil */}
        <div className="mx-auto w-full max-w-[320px] shrink-0 lg:mx-0 lg:w-[300px]">
          <svg viewBox={`0 0 ${CONE_W} ${svgH}`} className="h-auto w-full" role="img" aria-label="Funil de vendas">
            {rows.map((r, i) => {
              const y = i * (ROW_H + ROW_GAP);
              const wTop = EDGES[i];
              const wBottom = EDGES[i + 1];
              const cx = CONE_W / 2;
              const x1 = cx - wTop / 2;
              const x2 = cx + wTop / 2;
              const x3 = cx + wBottom / 2;
              const x4 = cx - wBottom / 2;
              const Icon = r.icon;
              return (
                <g key={r.n}>
                  <polygon
                    points={`${x1},${y} ${x2},${y} ${x3},${y + ROW_H} ${x4},${y + ROW_H}`}
                    fill={r.tone}
                    opacity={0.92}
                  />
                  {/* boca elíptica para dar volume de cone */}
                  <ellipse cx={cx} cy={y} rx={wTop / 2} ry={7} fill={r.tone} opacity={0.55} />
                  <foreignObject x={x4} y={y + 8} width={wBottom} height={ROW_H - 16}>
                    <div className="flex h-full flex-col items-center justify-center gap-1 text-center leading-tight">
                      <Icon className="h-4 w-4 text-primary-foreground" />
                      <span className="px-1 text-[10px] font-bold uppercase text-primary-foreground">
                        {r.label}
                      </span>
                    </div>
                  </foreignObject>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Colunas de números */}
        <div className="min-w-0 flex-1 space-y-2">
          {rows.map((r) => {
            const behind = r.gap < 0;
            return (
              <div
                key={r.n}
                className="grid grid-cols-3 items-center gap-2 rounded-xl border bg-muted/30 px-3"
                style={{ minHeight: ROW_H }}
              >
                <div className="text-center">
                  <div className="font-mono text-2xl font-bold tabular-nums leading-none md:text-3xl">{r.real}</div>
                  <div className="mt-1.5 inline-block rounded-md bg-success/15 px-2 py-0.5 text-xs font-extrabold tabular-nums text-success ring-1 ring-success/30 md:text-sm">
                    {fmtPct(r.realPct)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-mono text-2xl font-bold tabular-nums leading-none text-muted-foreground md:text-3xl">
                    {r.ideal}
                  </div>
                  <div className="mt-1.5 inline-block rounded-md bg-muted px-2 py-0.5 text-xs font-extrabold tabular-nums text-muted-foreground ring-1 ring-border md:text-sm">
                    {fmtPct(r.idealPct)}
                  </div>
                </div>
                <div className="text-center">
                  {r.n === "01" ? (
                    <>
                      <div className="font-mono text-2xl font-bold leading-none text-muted-foreground md:text-3xl">—</div>
                      <div className="mt-1.5 inline-block rounded-md bg-muted px-2 py-0.5 text-xs font-extrabold text-muted-foreground ring-1 ring-border md:text-sm">
                        0%
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        className={cn(
                          "font-mono text-2xl font-bold tabular-nums leading-none md:text-3xl",
                          behind ? "text-destructive" : "text-success",
                        )}
                      >
                        {r.gap > 0 ? `+${r.gap}` : r.gap}
                      </div>
                      <div
                        className={cn(
                          "mt-1.5 inline-block rounded-md px-2 py-0.5 text-xs font-extrabold tabular-nums ring-1 md:text-sm",
                          behind
                            ? "bg-destructive/15 text-destructive ring-destructive/30"
                            : "bg-success/15 text-success ring-success/30",
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
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border-2 border-destructive/30 bg-destructive/5 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-destructive">
            <TrendingDown className="h-4 w-4" /> Principal gargalo
          </div>
          <p className="mt-1.5 text-sm font-semibold text-foreground">
            {leads > 0 ? bottleneck.label : "Sem leads no período"}
          </p>
        </div>
        <div className="rounded-2xl border-2 border-info/30 bg-info/5 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-info">
            <Target className="h-4 w-4" /> Nossa meta
          </div>
          <p className="mt-1.5 text-sm font-semibold text-foreground">
            {goals.simulacoes}% simulações · {goals.reunioes}% reuniões · {goals.fechados}% fechamentos
          </p>
        </div>
        <div className="rounded-2xl border-2 border-success/30 bg-success/5 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-success">
            <Flame className="h-4 w-4" /> Foco diário
          </div>
          <p className="mt-1.5 text-sm font-semibold text-foreground">
            Mais simulações, mais reuniões, mais fechamentos.
          </p>
        </div>
      </div>

    </Card>
  );
}
