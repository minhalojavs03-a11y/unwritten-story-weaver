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
        "relative overflow-hidden rounded-2xl border border-amber-500/30",
        "bg-[linear-gradient(135deg,#1a1407_0%,#2a1d09_50%,#100a04_100%)]",
        "text-amber-50 shadow-[0_18px_40px_-22px_rgba(180,120,30,0.6)]",
        compact ? "p-3" : "p-4 md:p-5",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full opacity-60 blur-3xl"
        style={{ background: "#f5b942" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(255,210,120,0.7) 0 1px, transparent 1px 12px)",
        }}
      />

      <div className="relative flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-400/40">
          <Gift className="h-5 w-5 text-amber-300" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300 ring-1 ring-amber-400/30">
              <Sparkles className="h-3 w-3" /> em breve
            </span>
            <h3 className="font-display text-base font-semibold tracking-tight text-amber-50 md:text-lg">
              Premiações por elo + bônus de meta
            </h3>
          </div>
          <p className={cn("mt-1 text-amber-100/80", compact ? "text-xs" : "text-sm")}>
            A cada novo <span className="font-semibold text-amber-200">elo</span> conquistado você ganha um
            <span className="font-semibold text-amber-200"> prêmio exclusivo</span>, e bater metas vai liberar
            <span className="font-semibold text-amber-200"> bônus em dinheiro</span>. Os valores serão divulgados em breve —
            comece já a acumular pontos para largar na frente.
          </p>
          {!compact && (
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-amber-100/90">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 ring-1 ring-white/10">
                <Target className="h-3 w-3 text-amber-300" /> Bônus por meta batida
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 ring-1 ring-white/10">
                <Sparkles className="h-3 w-3 text-amber-300" /> Recompensa a cada elo subido
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 ring-1 ring-white/10">
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
