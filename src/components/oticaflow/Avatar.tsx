import { useState } from "react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

// 26 cores vibrantes mas suaves, uma por letra do alfabeto (A-Z).
// bg = fundo translúcido / fg = texto bem contrastado.
const LETTER_PALETTE: Record<string, { bg: string; fg: string }> = {
  A: { bg: "hsl(0 85% 92%)",   fg: "hsl(0 70% 35%)" },
  B: { bg: "hsl(15 90% 92%)",  fg: "hsl(15 75% 35%)" },
  C: { bg: "hsl(30 92% 90%)",  fg: "hsl(30 80% 32%)" },
  D: { bg: "hsl(45 92% 88%)",  fg: "hsl(40 80% 30%)" },
  E: { bg: "hsl(60 80% 86%)",  fg: "hsl(55 70% 28%)" },
  F: { bg: "hsl(80 70% 88%)",  fg: "hsl(85 60% 28%)" },
  G: { bg: "hsl(100 65% 88%)", fg: "hsl(110 55% 28%)" },
  H: { bg: "hsl(130 60% 88%)", fg: "hsl(140 55% 28%)" },
  I: { bg: "hsl(150 60% 88%)", fg: "hsl(155 60% 28%)" },
  J: { bg: "hsl(165 65% 86%)", fg: "hsl(170 65% 28%)" },
  K: { bg: "hsl(180 65% 86%)", fg: "hsl(185 70% 28%)" },
  L: { bg: "hsl(190 75% 88%)", fg: "hsl(195 75% 30%)" },
  M: { bg: "hsl(200 80% 90%)", fg: "hsl(205 75% 32%)" },
  N: { bg: "hsl(210 85% 90%)", fg: "hsl(215 75% 38%)" },
  O: { bg: "hsl(220 90% 91%)", fg: "hsl(225 75% 42%)" },
  P: { bg: "hsl(235 85% 92%)", fg: "hsl(240 65% 45%)" },
  Q: { bg: "hsl(250 80% 92%)", fg: "hsl(255 60% 45%)" },
  R: { bg: "hsl(265 75% 92%)", fg: "hsl(270 55% 45%)" },
  S: { bg: "hsl(280 75% 92%)", fg: "hsl(285 55% 42%)" },
  T: { bg: "hsl(295 75% 92%)", fg: "hsl(300 55% 40%)" },
  U: { bg: "hsl(310 80% 92%)", fg: "hsl(315 60% 40%)" },
  V: { bg: "hsl(325 80% 92%)", fg: "hsl(330 65% 40%)" },
  W: { bg: "hsl(340 85% 92%)", fg: "hsl(345 70% 40%)" },
  X: { bg: "hsl(355 85% 92%)", fg: "hsl(355 70% 38%)" },
  Y: { bg: "hsl(25 85% 90%)",  fg: "hsl(25 75% 32%)" },
  Z: { bg: "hsl(210 15% 90%)", fg: "hsl(215 20% 30%)" },
};

function firstLetter(name: string): string {
  const s = (name ?? "").trim();
  for (const ch of s) {
    const up = ch.toUpperCase();
    if (up >= "A" && up <= "Z") return up;
  }
  return "?";
}

function colorFor(name: string) {
  const key = firstLetter(name);
  return LETTER_PALETTE[key] ?? { bg: "hsl(220 15% 90%)", fg: "hsl(220 20% 30%)" };
}

export function InitialsAvatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  const [errored, setErrored] = useState(false);
  const showImage = !!src && !errored;
  const { bg, fg } = colorFor(name);
  return (
    <div
      className={cn("relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full font-display text-sm font-semibold", className)}
      style={showImage ? undefined : { backgroundColor: bg, color: fg }}
    >
      {showImage ? (
        <img src={src!} alt={name} className="h-full w-full object-cover" onError={() => setErrored(true)} loading="lazy" />
      ) : (
        <span>{initials(name)}</span>
      )}
    </div>
  );
}

