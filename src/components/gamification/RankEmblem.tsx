import { cn } from "@/lib/utils";
import bronzeImg from "@/assets/ranks/bronze.png";
import prataImg from "@/assets/ranks/prata.png";
import ouroImg from "@/assets/ranks/ouro.png";
import diamanteImg from "@/assets/ranks/diamante.png";

type Props = {
  color: string;
  tier?: number; // 1..N
  size?: number;
  className?: string;
};

const TIER_IMAGES = [bronzeImg, prataImg, ouroImg, diamanteImg];

/**
 * Emblema de elo — ilustrações ultra-refinadas (Bronze → Diamante),
 * estilo insígnias de jogos competitivos. A cor é apenas referência
 * (usada em halos/barras pelos cards); o visual vem do PNG.
 */
export function RankEmblem({ color, tier = 1, size = 72, className }: Props) {
  const idx = Math.min(TIER_IMAGES.length - 1, Math.max(0, tier - 1));
  const src = TIER_IMAGES[idx];

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* halo sutil da cor do elo */}
      <span
        className="pointer-events-none absolute inset-0 rounded-full blur-2xl opacity-40"
        style={{ background: `radial-gradient(circle at 50% 45%, ${color}, transparent 65%)` }}
      />
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        draggable={false}
        className="relative h-full w-full object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,0.25)] select-none"
      />
    </div>
  );
}

export default RankEmblem;
