import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionTitle } from "@/components/dashboard/ExecutiveWidgets";
import { TrendingDown, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Stage } from "@/data/mock";

type FunnelStage = { key: Stage; stage: string; count: number };
type LostReason = { reason: string; count: number; pct: number };

// Paleta consórcio: do azul-escuro (volume) ao verde (venda)
const STAGE_STYLE: Record<Stage, { fill: string; label: string }> = {
  novo:        { fill: "#1e3a8a", label: "Novo Lead" },
  qualificado: { fill: "#2563eb", label: "Em Atendimento" },
  agendado:    { fill: "#7c3aed", label: "Simulação Enviada" },
  compareceu:  { fill: "#9333ea", label: "Proposta Aceita" },
  comprou:     { fill: "#16a34a", label: "Cota Vendida" },
  perdido:     { fill: "#ef4444", label: "Desqualificado" },
};

interface Props {
  funnel: FunnelStage[];          // sem "perdido"
  lost: number;                    // total desqualificados
  lostReasons?: LostReason[];      // opcional, mostra ao lado
  /** compact = sem coluna lateral (usado em dashboard pessoal) */
  compact?: boolean;
}

export function ConsorcioFunnel({ funnel, lost, lostReasons = [], compact = false }: Props) {
  const stages = funnel.filter((s) => s.key !== "perdido");
  const top = Math.max(1, stages[0]?.count ?? 1);
  const W = 520;
  const H = 60;          // altura de cada bloco
  const GAP = 6;
  const MIN_W = 90;      // largura mínima do bloco final

  // largura proporcional ao volume da etapa
  const widthFor = (count: number) =>
    Math.max(MIN_W, (count / top) * (W - 40));

  return (
    <Card className="p-5">
      <SectionTitle
        title="Funil de Consórcio"
        sub="Jornada do lead até a venda da cota"
        action={
          <Badge variant="secondary" className="font-mono text-[11px]">
            {stages.reduce((s, x) => s + x.count, 0)} leads
          </Badge>
        }
      />

      <div className={cn("grid gap-5", !compact && "lg:grid-cols-[1.4fr_1fr]")}>
        {/* COLUNA 1 — Funil visual */}
        <div className="flex flex-col items-center">
          <svg
            viewBox={`0 0 ${W} ${(H + GAP) * stages.length}`}
            className="w-full max-w-xl"
            role="img"
            aria-label="Funil de conversão de consórcio"
          >
            {stages.map((s, i) => {
              const style = STAGE_STYLE[s.key];
              const w = widthFor(s.count);
              const wNext = stages[i + 1] ? widthFor(stages[i + 1].count) : w * 0.75;
              const y = i * (H + GAP);
              const x1 = (W - w) / 2;
              const x2 = x1 + w;
              const xn1 = (W - wNext) / 2;
              const xn2 = xn1 + wNext;
              const points = `${x1},${y} ${x2},${y} ${xn2},${y + H} ${xn1},${y + H}`;
              const prev = stages[i - 1];
              const dropPct =
                prev && prev.count > 0
                  ? Math.round(((prev.count - s.count) / prev.count) * 100)
                  : null;
              return (
                <g key={s.key}>
                  <polygon
                    points={points}
                    fill={style.fill}
                    className="transition-opacity hover:opacity-90"
                  />
                  {/* Quantidade ao centro */}
                  <text
                    x={W / 2}
                    y={y + H / 2 + 6}
                    textAnchor="middle"
                    className="fill-white font-display"
                    style={{ fontSize: 22, fontWeight: 800 }}
                  >
                    {s.count}
                  </text>
                  {/* Label à direita */}
                  <text
                    x={x2 + 10}
                    y={y + H / 2 + 4}
                    className="fill-foreground"
                    style={{ fontSize: 12, fontWeight: 600 }}
                  >
                    {style.label}
                  </text>
                  {/* Queda entre etapas à esquerda */}
                  {dropPct !== null && dropPct > 0 && (
                    <text
                      x={x1 - 10}
                      y={y + H / 2 + 4}
                      textAnchor="end"
                      className="fill-muted-foreground"
                      style={{ fontSize: 11, fontWeight: 600 }}
                    >
                      -{dropPct}%
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Desqualificados — base do funil */}
          <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-1.5 text-sm">
            <AlertCircle className="h-4 w-4 text-rose-500" />
            <span className="font-semibold text-rose-600 tabular-nums">{lost}</span>
            <span className="text-muted-foreground">desqualificados no período</span>
          </div>
        </div>

        {/* COLUNA 2 — Motivos / Taxa de conversão */}
        {!compact && (
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <TrendingDown className="h-3.5 w-3.5" /> Conversão por etapa
              </div>
              <div className="space-y-1.5">
                {stages.map((s, i) => {
                  const next = stages[i + 1];
                  if (!next || s.count === 0) return null;
                  const conv = Math.round((next.count / s.count) * 100);
                  return (
                    <div key={s.key} className="flex items-center gap-2 text-xs">
                      <span className="flex-1 truncate text-muted-foreground">
                        {STAGE_STYLE[s.key].label} → {STAGE_STYLE[next.key].label}
                      </span>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 font-mono font-semibold tabular-nums",
                          conv >= 60
                            ? "bg-emerald-500/15 text-emerald-600"
                            : conv >= 30
                              ? "bg-amber-500/15 text-amber-600"
                              : "bg-rose-500/15 text-rose-600",
                        )}
                      >
                        {conv}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {lostReasons.length > 0 && (
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Motivos de desqualificação
                </div>
                <div className="space-y-2">
                  {lostReasons.slice(0, 5).map((r) => (
                    <div key={r.reason}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="truncate font-medium">{r.reason}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {r.count} ({r.pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-rose-500/70"
                          style={{ width: `${Math.min(100, r.pct)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Taxa global */}
            {stages[0]?.count > 0 && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Conversão total
                </div>
                <div className="mt-1 font-display text-2xl font-bold tabular-nums">
                  {(((stages[stages.length - 1]?.count ?? 0) / stages[0].count) * 100).toFixed(1)}%
                </div>
                <div className="text-[11px] text-muted-foreground">
                  do Novo Lead até a Cota Vendida
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
