import { cn } from "@/lib/utils";

type Temp = "hot" | "warm" | "cold" | string | null | undefined;

interface Props {
  temperature?: Temp;
  stage?: string | null;
  /** Override: 0..1 progress. If provided, ignores temperature/stage. */
  score?: number;
  className?: string;
  /** sm = 3px (cards/listas), md = 5px (chat) */
  size?: "sm" | "md";
  /** Mostra rótulo "x%" ao lado da barra */
  showPercent?: boolean;
  /** Mostra o marcador de % posicionado sobre a barra */
  showMarker?: boolean;
}

const tempWeight: Record<string, number> = { cold: 0.2, warm: 0.55, hot: 0.85 };
const stageWeight: Record<string, number> = {
  novo: 0.1,
  qualificado: 0.3,
  agendado: 0.55,
  compareceu: 0.8,
  comprou: 1,
  perdido: 0,
  atendimento: 0.4,
};

export function computeLeadScore(temperature?: Temp, stage?: string | null): number {
  const t = tempWeight[String(temperature ?? "cold")] ?? 0.2;
  const s = stageWeight[String(stage ?? "novo")] ?? 0.1;
  // pondera estágio (60%) + temperatura (40%)
  return Math.max(0, Math.min(1, s * 0.6 + t * 0.4));
}

export function LeadProgressBar({
  temperature,
  stage,
  score,
  className,
  size = "sm",
  showPercent = false,
  showMarker = true,
}: Props) {
  const value = score ?? computeLeadScore(temperature, stage);
  const pct = Math.round(value * 100);
  const closed = stage === "comprou";
  const lost = stage === "perdido";

  return (
    <div className={cn("flex w-full items-center gap-2", className)}>
      <div className="relative w-full">
        <div
          className={cn(
            "relative w-full overflow-hidden rounded-full bg-muted",
            size === "sm" ? "h-1" : "h-1.5",
          )}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          title={lost ? "Perdido" : `Probabilidade de fechar: ${pct}%`}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700 ease-out",
              lost
                ? "bg-stage-closed/60"
                : closed
                  ? "bg-success"
                  : "bg-[linear-gradient(to_right,#22c55e_0%,#facc15_35%,#f97316_65%,#ef4444_100%)]",
            )}
            style={{ width: `${lost ? 100 : pct}%` }}
          />
        </div>
        {showMarker && !lost && !closed && pct > 4 && pct < 100 && (
          <div
            className="pointer-events-none absolute top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${pct}%` }}
            aria-hidden
          >
            <span className="mb-0.5 whitespace-nowrap rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground ring-1 ring-border/30">
              {pct}%
            </span>
            <div className="h-2 w-2 rounded-full bg-muted ring-2 ring-border/40" />
          </div>
        )}
      </div>
      {showPercent && (
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground ring-1 ring-border/30">
          {lost ? "—" : `${pct}%`}
        </span>
      )}
    </div>
  );
}

