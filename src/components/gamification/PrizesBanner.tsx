import { Gift, Sparkles, Target } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  compact?: boolean;
};

/**
 * Banner anunciando que haverá premiação a cada elo conquistado e
 * bônus por bater metas — detalhes ainda em definição.
 */
export function PrizesBanner({ className, compact = false }: Props) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-amber-200 bg-card text-card-foreground",
        "shadow-sm",
        compact ? "p-3" : "p-4 md:p-5",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full opacity-30 blur-3xl"
        style={{ background: "#f5b942" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-amber-400 to-amber-600"
      />

      <div className="relative flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 ring-1 ring-amber-200">
          <Gift className="h-5 w-5 text-amber-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700 ring-1 ring-amber-200">
              <Sparkles className="h-3 w-3" /> em breve
            </span>
            <h3 className="font-display text-base font-semibold tracking-tight md:text-lg">
              Premiações por elo + bônus de meta
            </h3>
          </div>
          <p className={cn("mt-1 text-muted-foreground", compact ? "text-xs" : "text-sm")}>
            A cada novo <span className="font-semibold text-foreground">elo</span> conquistado você ganha um
            <span className="font-semibold text-foreground"> prêmio exclusivo</span>, e bater metas vai liberar
            <span className="font-semibold text-foreground"> bônus em dinheiro</span>. Os valores serão divulgados em breve —
            comece já a acumular pontos para largar na frente.
          </p>
          {!compact && (
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 ring-1 ring-border">
                <Target className="h-3 w-3 text-amber-600" /> Bônus por meta batida
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 ring-1 ring-border">
                <Sparkles className="h-3 w-3 text-amber-600" /> Recompensa a cada elo subido
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 ring-1 ring-border">
                🏆 Top 1 do mês ganha extra
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PrizesBanner;
