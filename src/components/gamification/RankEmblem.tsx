import { cn } from "@/lib/utils";

type Props = {
  color: string;
  tier?: number; // 1..N, optional, used to slightly vary ornaments
  size?: number;
  className?: string;
};

/**
 * Emblema de nível inspirado em insígnias de elo (League of Legends).
 * Render 100% em SVG, usa a cor do nível como base e gera um escudo
 * hexagonal com gemas, chevrons e brilho.
 */
export function RankEmblem({ color, tier = 1, size = 72, className }: Props) {
  const id = `re-${color.replace(/[^a-z0-9]/gi, "")}-${tier}`;
  const chevrons = Math.min(3, Math.max(1, Math.ceil(tier / 2)));

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 100 100" width={size} height={size} className="drop-shadow-[0_8px_18px_rgba(0,0,0,0.25)]">
        <defs>
          <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop offset="55%" stopColor={color} stopOpacity="0.85" />
            <stop offset="100%" stopColor="#0b0b14" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fefefe" stopOpacity="0.95" />
            <stop offset="50%" stopColor="#d8d8e0" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#7c7c8a" stopOpacity="1" />
          </linearGradient>
          <radialGradient id={`${id}-glow`} cx="50%" cy="35%" r="55%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#000" floodOpacity="0.35" />
          </filter>
        </defs>

        {/* Anel externo metálico */}
        <polygon
          points="50,4 90,26 90,74 50,96 10,74 10,26"
          fill={`url(#${id}-metal)`}
          stroke="#1a1a22"
          strokeWidth="1"
        />
        {/* Escudo interno colorido */}
        <polygon
          points="50,11 84,29 84,71 50,89 16,71 16,29"
          fill={`url(#${id}-bg)`}
          stroke="#0b0b14"
          strokeWidth="0.6"
        />
        {/* Brilho superior */}
        <polygon points="50,11 84,29 84,71 50,89 16,71 16,29" fill={`url(#${id}-glow)`} />

        {/* Chevrons centrais (variam por tier) */}
        <g filter={`url(#${id}-shadow)`}>
          {Array.from({ length: chevrons }).map((_, i) => {
            const y = 56 - i * 10;
            return (
              <path
                key={i}
                d={`M30 ${y} L50 ${y - 12} L70 ${y} L66 ${y + 2} L50 ${y - 8} L34 ${y + 2} Z`}
                fill={`url(#${id}-metal)`}
                opacity={1 - i * 0.18}
              />
            );
          })}
        </g>

        {/* Gema central */}
        <g filter={`url(#${id}-shadow)`}>
          <polygon
            points="50,70 56,76 50,84 44,76"
            fill={color}
            stroke="#fff"
            strokeOpacity="0.6"
            strokeWidth="0.5"
          />
          <polygon points="50,70 56,76 50,77 44,76" fill="#fff" opacity="0.55" />
        </g>

        {/* Estrelas laterais para tiers altos */}
        {tier >= 4 && (
          <>
            <circle cx="24" cy="50" r="1.8" fill="#fff" opacity="0.85" />
            <circle cx="76" cy="50" r="1.8" fill="#fff" opacity="0.85" />
          </>
        )}
      </svg>
    </div>
  );
}

export default RankEmblem;
