import { Link } from "react-router-dom";
import { ChevronRight, Sparkles } from "lucide-react";
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
        "group relative overflow-hidden rounded-2xl border border-border bg-card text-card-foreground",
        "shadow-sm transition-shadow hover:shadow-md",
        isCompact ? "p-3" : "p-5",
        className,
      )}
    >
      {/* halo sutil da cor do elo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full opacity-20 blur-3xl"
        style={{ background: current.color }}
      />
      {/* faixa lateral colorida do elo */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-full w-1"
        style={{ background: `linear-gradient(180deg, ${current.color}, ${(next ?? current).color})` }}
      />

      <div className={cn("relative flex items-center", isCompact ? "gap-3" : "gap-5")}>
        <RankEmblem color={current.color} tier={tier} size={emblemSize} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              {isCompact ? "Meu elo" : "Nível atual"}
            </span>
            {!isCompact && (
              <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                {points} pts
              </span>
            )}
          </div>
          <div
            className={cn(
              "font-display font-semibold tracking-tight",
              isCompact ? "text-base leading-tight" : "text-2xl leading-tight",
            )}
            style={{ color: current.color }}
          >
            {current.label}
          </div>
          {next ? (
            <div className={cn("mt-2", isCompact ? "space-y-1" : "space-y-1.5")}>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="h-3 w-3" style={{ color: next.color }} />
                  <span className="font-medium" style={{ color: next.color }}>{next.label}</span>
                </span>
                <span className="tabular-nums">
                  faltam <span className="font-semibold text-foreground">{pointsToNext}</span> pts
                </span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-muted shadow-inner">
                <div
                  className="relative h-full overflow-hidden rounded-full transition-all duration-700 energy-shine energy-stripes"
                  style={{
                    width: `${progress}%`,
                    boxShadow: `0 0 10px ${current.color}80`,
                  }}
                >
                  <div
                    className="h-full w-full energy-bar"
                    style={{
                      backgroundImage: `linear-gradient(90deg, ${current.color}, ${next.color}, ${current.color}, ${next.color})`,
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-2 text-[11px] text-muted-foreground">Elo máximo atingido 🏆</div>
          )}
        </div>

        {isCompact && (
          <ChevronRight className="ml-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        )}
      </div>

      {!isCompact && (
        <div className="relative mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
          <Stat label="Posição" value={summary?.rank_position ? `${summary.rank_position}º` : "—"} sub={summary?.total_members ? `de ${summary.total_members}` : undefined} />
          <Stat label="Pontos" value={points.toLocaleString("pt-BR")} />
          <Stat label="Vendas" value={summary?.sales ?? 0} accent={current.color} />
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

function Stat({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: string }) {
  return (
    <div>
      <div
        className="font-display text-lg font-semibold tabular-nums tracking-tight"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
      <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}{sub ? ` · ${sub}` : ""}
      </div>
    </div>
  );
}

export default RankCard;
