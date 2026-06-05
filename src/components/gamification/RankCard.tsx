import { Link } from "react-router-dom";
import { ChevronRight, Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { RankEmblem } from "./RankEmblem";
import { useMyGamificationSummary, useGamificationConfig, levelFor, type Period } from "@/hooks/useGamification";

type Variant = "full" | "compact";

type Props = {
  variant?: Variant;
  period?: Period;
  className?: string;
  /** when true, makes the whole card a link to /ranking */
  asLink?: boolean;
};

/**
 * Cartão de elo / desempenho — visual sofisticado inspirado em ranks
 * competitivos. Usado em /ranking (full) e no Início (compact, num canto).
 */
export function RankCard({ variant = "full", period = "monthly", className, asLink = false }: Props) {
  const { data: summary } = useMyGamificationSummary(period);
  const { data: config } = useGamificationConfig();
  const points = summary?.points ?? 0;
  const { current, next, progress } = levelFor(points, config);
  const tier = Math.max(1, (config?.levels ?? []).findIndex((l: any) => l.label === current.label) + 1);
  const pointsToNext = next ? Math.max(0, next.min_points - points) : 0;

  const isCompact = variant === "compact";
  const emblemSize = isCompact ? 56 : 80;

  const inner = (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-white/5",
        "bg-[linear-gradient(135deg,#0b0b16_0%,#13132a_45%,#0a0a18_100%)]",
        "text-white shadow-[0_18px_50px_-22px_rgba(0,0,0,0.7)]",
        isCompact ? "p-3" : "p-5",
        className,
      )}
    >
      {/* halo da cor do elo */}
      <div
        className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full opacity-40 blur-3xl"
        style={{ background: current.color }}
      />
      {/* linhas finas decorativas */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(255,255,255,0.6) 0 1px, transparent 1px 14px)",
        }}
      />
      {/* canto: faixa metálica */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-px top-3 h-px w-12"
        style={{ background: `linear-gradient(90deg, transparent, ${current.color})` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-px bottom-3 h-px w-12"
        style={{ background: `linear-gradient(270deg, transparent, ${current.color})` }}
      />

      <div className={cn("relative flex items-center", isCompact ? "gap-3" : "gap-5")}>
        <RankEmblem color={current.color} tier={tier} size={emblemSize} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.22em] text-white/45">
              {isCompact ? "Meu elo" : "Nível atual"}
            </span>
            {!isCompact && (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium tabular-nums text-white/70">
                {points} pts
              </span>
            )}
          </div>
          <div
            className={cn(
              "font-display font-semibold tracking-tight",
              isCompact ? "text-base leading-tight" : "text-2xl leading-tight",
            )}
            style={{ color: current.color, textShadow: `0 0 28px ${current.color}66` }}
          >
            {current.label}
          </div>
          {next ? (
            <div className={cn("mt-2", isCompact ? "space-y-1" : "space-y-1.5")}>
              <div className="flex items-center justify-between text-[10px] text-white/55">
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="h-3 w-3" style={{ color: next.color }} />
                  <span className="font-medium" style={{ color: next.color }}>{next.label}</span>
                </span>
                <span className="tabular-nums">
                  faltam <span className="font-semibold text-white">{pointsToNext}</span> pts
                </span>
              </div>
              <div className="relative h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${progress}%`,
                    background: `linear-gradient(90deg, ${current.color}, ${next.color})`,
                    boxShadow: `0 0 10px ${next.color}80`,
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="mt-2 text-[11px] text-white/60">Elo máximo atingido 🏆</div>
          )}
        </div>

        {isCompact && (
          <ChevronRight className="ml-1 h-4 w-4 shrink-0 text-white/40 transition-transform group-hover:translate-x-0.5 group-hover:text-white/70" />
        )}
      </div>

      {!isCompact && (
        <div className="relative mt-4 grid grid-cols-3 gap-2 border-t border-white/5 pt-3 text-center">
          <Stat label="Posição" value={summary?.rank_position ? `${summary.rank_position}º` : "—"} sub={summary?.total_members ? `de ${summary.total_members}` : undefined} />
          <Stat label="Pontos" value={points.toLocaleString("pt-BR")} />
          <Stat label="Vendas" value={summary?.sales ?? 0} accent={current.color} />
        </div>
      )}
    </div>
  );

  if (asLink) {
    return (
      <Link to="/ranking" className={cn("block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-2xl", className)}>
        {inner}
      </Link>
    );
  }
  return inner;
}

function Stat({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: string }) {
  return (
    <div>
      <div
        className="font-display text-lg font-semibold tabular-nums tracking-tight"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
      <div className="text-[9px] uppercase tracking-[0.18em] text-white/45">
        {label}{sub ? ` · ${sub}` : ""}
      </div>
    </div>
  );
}

export default RankCard;
