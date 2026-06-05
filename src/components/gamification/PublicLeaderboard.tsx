import { Link } from "react-router-dom";
import { Trophy, Crown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { cn } from "@/lib/utils";
import { RankEmblem } from "./RankEmblem";
import { levelFor, tierForLevel, type RankingRow, type GamificationConfig } from "@/hooks/useGamification";

type Props = {
  rows: RankingRow[];
  config?: GamificationConfig | null;
  highlightMemberId?: string | null;
  className?: string;
};

/**
 * Leaderboard público — exibe TODOS os consultores com elo, barra de
 * progresso até o próximo elo e pontos. Pensado para incentivar
 * competição: cada um vê o quão próximo (ou distante) está dos colegas.
 */
export function PublicLeaderboard({ rows, config, highlightMemberId, className }: Props) {
  if (!rows.length) {
    return (
      <Card className={cn("p-6 text-center text-sm text-muted-foreground", className)}>
        Ranking ainda vazio neste período. Comece a pontuar 🚀
      </Card>
    );
  }

  const leader = rows[0];

  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          <h3 className="font-display text-sm font-semibold tracking-tight">Placar público da equipe</h3>
        </div>
        <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {rows.length} {rows.length === 1 ? "consultor" : "consultores"}
        </span>
      </div>

      <ul className="divide-y divide-border/60">
        {rows.map((row, i) => {
          const { current, next, progress } = levelFor(row.points, config);
          const tier = tierForLevel(current, config);
          const isMe = highlightMemberId && row.member_id === highlightMemberId;
          const gap = leader ? Math.max(0, leader.points - row.points) : 0;
          const position = i + 1;

          return (
            <li
              key={row.member_id}
              className={cn(
                "relative flex items-center gap-3 px-4 py-3 transition-colors",
                isMe ? "bg-primary/5" : "hover:bg-muted/40",
              )}
            >
              {isMe && (
                <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
              )}

              <div className="flex w-7 shrink-0 items-center justify-center">
                {position === 1 ? (
                  <Crown className="h-4 w-4 text-amber-500" />
                ) : (
                  <span className="font-display text-sm font-semibold tabular-nums text-muted-foreground">
                    {position}
                  </span>
                )}
              </div>

              <RankEmblem color={current.color} tier={tier} size={36} />

              <UserAvatar
                userId={row.member_id}
                name={row.display_name}
                avatarUrl={row.avatar_url}
                avatarColor={row.avatar_color ?? undefined}
                size={32}
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={cn("truncate text-sm font-semibold", isMe && "text-primary")}>
                    {row.display_name}
                    {isMe && <span className="ml-1 text-[10px] font-medium text-primary/80">(você)</span>}
                  </span>
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                    style={{ color: current.color, background: `${current.color}1a` }}
                  >
                    {current.label}
                  </span>
                </div>

                <div className="mt-1.5">
                  <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${progress}%`,
                        background: next
                          ? `linear-gradient(90deg, ${current.color}, ${next.color})`
                          : current.color,
                        boxShadow: `0 0 8px ${(next ?? current).color}80`,
                      }}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="tabular-nums">
                      {row.sales} venda{row.sales === 1 ? "" : "s"} · {row.meetings} reuniões
                    </span>
                    <span className="tabular-nums">
                      {next ? (
                        <>faltam <span className="font-semibold text-foreground">{Math.max(0, next.min_points - row.points)}</span> pts → <span style={{ color: next.color }}>{next.label}</span></>
                      ) : (
                        <span className="font-semibold text-amber-600">Elo máximo</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div className="ml-2 shrink-0 text-right">
                <div
                  className="font-display text-base font-semibold tabular-nums tracking-tight"
                  style={{ color: position === 1 ? current.color : undefined }}
                >
                  {row.points.toLocaleString("pt-BR")}
                </div>
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  {position === 1 ? "líder" : `-${gap} pts`}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-border/60 bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
        <Link to="/ranking" className="font-medium text-primary hover:underline">Veja ranking completo →</Link>
        <span className="ml-2">Disputa pública — todos os consultores enxergam tudo.</span>
      </div>
    </Card>
  );
}

export default PublicLeaderboard;
