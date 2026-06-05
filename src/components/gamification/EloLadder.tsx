import { Link } from "react-router-dom";
import { Lock, Check, Sparkles, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { RankEmblem } from "./RankEmblem";
import { useMyGamificationSummary, useGamificationConfig, levelFor, type Period } from "@/hooks/useGamification";

type Variant = "full" | "compact";

type Props = {
  variant?: Variant;
  period?: Period;
  className?: string;
  asLink?: boolean;
};

const DEFAULT_LEVELS = [
  { key: "bronze", label: "Bronze", min_points: 0, color: "#B45309" },
  { key: "prata", label: "Prata", min_points: 500, color: "#94A3B8" },
  { key: "ouro", label: "Ouro", min_points: 1500, color: "#D4A017" },
  { key: "diamante", label: "Diamante", min_points: 4000, color: "#22D3EE" },
];

/**
 * Escada de elos — mostra TODOS os tiers (Bronze → Diamante) em uma
 * trilha gamificada. O elo atual é destacado, os anteriores aparecem
 * como conquistados (check) e os próximos como bloqueados (cadeado),
 * com a barra de progresso indo até o próximo elo.
 */
export function EloLadder({ variant = "full", period = "monthly", className, asLink = false }: Props) {
  const { data: summary } = useMyGamificationSummary(period);
  const { data: config } = useGamificationConfig();
  const points = summary?.points ?? 0;
  const levels = (config?.levels?.length ? config.levels : DEFAULT_LEVELS)
    .slice()
    .sort((a: any, b: any) => a.min_points - b.min_points);
  const { current, next, progress } = levelFor(points, config);
  const currentIdx = Math.max(0, levels.findIndex((l: any) => l.label === current.label));
  const isCompact = variant === "compact";
  const emblemSize = isCompact ? 32 : 56;

  const inner = (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm",
        isCompact ? "p-3" : "p-4 md:p-5",
        className,
      )}
    >
      {/* halo sutil da cor do elo atual */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full opacity-15 blur-3xl"
        style={{ background: current.color }}
      />

      <div className="relative flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Trophy className="h-4 w-4 shrink-0 text-primary" />
          <h3 className={cn("font-display font-semibold tracking-tight truncate", isCompact ? "text-sm" : "text-base md:text-lg")}>
            Escada de elos
          </h3>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          <span>{points.toLocaleString("pt-BR")} pts</span>
        </div>
      </div>

      {/* Trilha */}
      <div className={cn("relative mt-4", isCompact ? "mt-3" : "mt-5")}>
        {/* linha base */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-muted shadow-inner" aria-hidden />
        {/* progresso total da trilha (até elo atual) — com carga de energia */}
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-2 overflow-hidden rounded-full transition-all duration-700 energy-shine"
          aria-hidden
          style={{
            width: `${trackProgress(currentIdx, levels.length, progress, !!next)}%`,
            boxShadow: `0 0 12px ${current.color}80, inset 0 0 6px rgba(255,255,255,0.35)`,
          }}
        >
          <div
            className="h-full w-full energy-bar"
            style={{
              backgroundImage: `linear-gradient(90deg, ${levels[0].color}, ${current.color}, ${(next ?? current).color}, ${current.color}, ${levels[0].color})`,
            }}
          />
        </div>
        {/* ponta luminosa indicando avanço */}
        {next && (
          <div
            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2 rounded-full energy-pulse"
            aria-hidden
            style={{
              left: `${trackProgress(currentIdx, levels.length, progress, !!next)}%`,
              background: current.color,
              boxShadow: `0 0 14px 3px ${current.color}, 0 0 4px 1px #fff`,
            }}
          />
        )}

        <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${levels.length}, minmax(0, 1fr))` }}>
          {levels.map((lv: any, i: number) => {
            const isCurrent = i === currentIdx;
            const isAchieved = i < currentIdx;
            const isLocked = i > currentIdx;
            const pointsTo = Math.max(0, lv.min_points - points);

            return (
              <li key={lv.key ?? lv.label} className="flex flex-col items-center text-center">
                <div
                  className={cn(
                    "relative flex items-center justify-center rounded-full",
                    isCurrent && "ring-2 ring-offset-2 ring-offset-card",
                  )}
                  style={isCurrent ? { boxShadow: `0 0 0 0 transparent`, ["--tw-ring-color" as any]: lv.color } : undefined}
                >
                  <div
                    className={cn(
                      "transition-all",
                      isCurrent && "scale-110",
                    )}
                  >
                    <RankEmblem color={lv.color} tier={i + 1} size={emblemSize} />
                  </div>
                  {isAchieved && (
                    <span
                      className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-card"
                      title="Conquistado"
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  )}
                  {isLocked && (
                    <span
                      className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground ring-2 ring-card"
                      title="Bloqueado"
                    >
                      <Lock className="h-2.5 w-2.5" />
                    </span>
                  )}
                </div>

                <div className={cn("mt-2 flex flex-col items-center", isCompact && "mt-1.5")}>
                  <span
                    className={cn(
                      "font-display font-semibold tracking-tight",
                      isCompact ? "text-[11px]" : "text-xs md:text-sm",
                      isLocked && "text-muted-foreground",
                    )}
                    style={!isLocked ? { color: lv.color } : undefined}
                  >
                    {lv.label}
                  </span>
                  {!isCompact && (
                    <span className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
                      {isCurrent ? (
                        next ? `${points - lv.min_points}/${(next.min_points - lv.min_points)}` : "MAX"
                      ) : isAchieved ? (
                        "conquistado"
                      ) : (
                        <>
                          {lv.min_points.toLocaleString("pt-BR")} pts
                          {pointsTo > 0 && i === currentIdx + 1 && (
                            <span className="ml-1 text-foreground/80">· faltam {pointsTo}</span>
                          )}
                        </>
                      )}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Rodapé: próximo elo + barra fina */}
      {!isCompact && (
        <div className="relative mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">
              Elo atual:{" "}
              <span className="font-semibold" style={{ color: current.color }}>{current.label}</span>
            </span>
            {next ? (
              <span className="text-muted-foreground">
                Próximo:{" "}
                <span className="font-semibold" style={{ color: next.color }}>{next.label}</span>
                <span className="ml-1 tabular-nums">· faltam <span className="font-semibold text-foreground">{Math.max(0, next.min_points - points)}</span> pts</span>
              </span>
            ) : (
              <span className="font-semibold text-amber-600">Elo máximo atingido 🏆</span>
            )}
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-muted shadow-inner">
            <div
              className="relative h-full overflow-hidden rounded-full transition-all duration-700 energy-shine"
              style={{
                width: `${progress}%`,
                boxShadow: `0 0 10px ${current.color}80`,
              }}
            >
              <div
                className="h-full w-full energy-bar"
                style={{
                  backgroundImage: next
                    ? `linear-gradient(90deg, ${current.color}, ${next.color}, ${current.color}, ${next.color})`
                    : `linear-gradient(90deg, ${current.color}, #fff8, ${current.color})`,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (asLink) {
    return (
      <Link to="/ranking" className={cn("block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60", className)}>
        {inner}
      </Link>
    );
  }
  return inner;
}

/**
 * Calcula o progresso (0..100) ao longo de toda a trilha, considerando
 * o índice do elo atual + progresso até o próximo.
 */
function trackProgress(currentIdx: number, total: number, progressInTier: number, hasNext: boolean) {
  if (total <= 1) return 100;
  if (!hasNext) return 100;
  const segments = total - 1; // espaços entre emblemas
  const base = (currentIdx / segments) * 100;
  const segSize = 100 / segments;
  return Math.min(100, base + (progressInTier / 100) * segSize);
}

export default EloLadder;
