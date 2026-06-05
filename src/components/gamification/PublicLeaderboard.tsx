import { Link } from "react-router-dom";
import { Trophy, Crown, Target, Calendar, MessageCircle, Inbox, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { cn } from "@/lib/utils";
import { RankEmblem } from "./RankEmblem";
import { levelFor, tierForLevel, type RankingRow, type GamificationConfig } from "@/hooks/useGamification";

type Props = {
  rows: RankingRow[];
  config?: GamificationConfig | null;
  highlightMemberId?: string | null;
  /** Tempo médio de atendimento por membro (em minutos), opcional. */
  timesByMember?: Record<string, number>;
  className?: string;
};

const labelTime = (m: number) =>
  !Number.isFinite(m) || m <= 0
    ? "—"
    : m < 1
      ? `${Math.round(m * 60)}s`
      : m < 60
        ? `${m.toFixed(1)} min`
        : `${(m / 60).toFixed(1)}h`;

const timeTone = (m: number) => {
  if (!Number.isFinite(m) || m <= 0) return "text-muted-foreground";
  if (m <= 3) return "text-emerald-600";
  if (m <= 5) return "text-amber-600";
  return "text-rose-600";
};

/**
 * Leaderboard público — exibe TODOS os consultores com elo, barra de
 * progresso até o próximo elo e os KPIs principais (vendas, reuniões,
 * contatos, leads assumidos e tempo de atendimento). Pensado para
 * incentivar competição: cada um vê quem está performando de verdade.
 */
export function PublicLeaderboard({ rows, config, highlightMemberId, timesByMember, className }: Props) {
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
          const { current, next, progress } = levelFor(row.points, config, row.sales ?? 0);
          const tier = tierForLevel(current, config);
          const isMe = highlightMemberId && row.member_id === highlightMemberId;
          const gap = leader ? Math.max(0, leader.points - row.points) : 0;
          const position = i + 1;
          const avgMin = timesByMember?.[row.member_id];
          const hasTime = typeof avgMin === "number" && Number.isFinite(avgMin) && avgMin > 0;

          return (
            <li
              key={row.member_id}
              className={cn(
                "relative px-4 py-3 transition-colors",
                isMe ? "bg-primary/5" : "hover:bg-muted/40",
              )}
            >
              {isMe && (
                <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
              )}

              <div className="flex items-center gap-3">
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
                  <div className="flex flex-wrap items-center gap-2">
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
                    <div className="mt-1 flex items-center justify-end text-[10px] text-muted-foreground">
                      <span className="tabular-nums">
                        {next ? (
                          (() => {
                            const ptsLeft = Math.max(0, next.min_points - row.points);
                            const salesLeft = Math.max(0, (next.min_sales ?? 0) - (row.sales ?? 0));
                            return (
                              <>
                                faltam{" "}
                                <span className="font-semibold text-foreground">{ptsLeft}</span> pts
                                {salesLeft > 0 && (
                                  <>
                                    {" "}+ <span className="font-semibold text-emerald-600">{salesLeft}</span> {salesLeft === 1 ? "venda" : "vendas"}
                                  </>
                                )}
                                {" "}→ <span style={{ color: next.color }}>{next.label}</span>
                              </>
                            );
                          })()
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
              </div>

              {/* KPIs — performance real do consultor (compacto em mobile) */}
              <div className="mt-2 flex flex-wrap items-center gap-1 sm:grid sm:grid-cols-5 sm:gap-1.5">
                <StatChip icon={Target} label="Vendas" value={row.sales} tone="emerald" highlight />
                <StatChip icon={Calendar} label="Reun." fullLabel="Reuniões" value={row.meetings} tone="sky" />
                <StatChip icon={MessageCircle} label="Cont." fullLabel="Contatos" value={row.contacts} tone="violet" />
                <StatChip icon={Inbox} label="Leads" value={row.leads_assumed} tone="slate" />
                <StatChip
                  icon={Zap}
                  label="T. méd."
                  fullLabel="Tempo méd."
                  value={hasTime ? labelTime(avgMin!) : "—"}
                  tone="amber"
                  valueClassName={hasTime ? timeTone(avgMin!) : undefined}
                />
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

const TONE_BG: Record<string, string> = {
  emerald: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  sky: "bg-sky-500/10 text-sky-700 border-sky-500/20",
  violet: "bg-violet-500/10 text-violet-700 border-violet-500/20",
  slate: "bg-slate-500/10 text-slate-700 border-slate-500/20",
  amber: "bg-amber-500/10 text-amber-700 border-amber-500/20",
};

function StatChip({
  icon: Icon,
  label,
  fullLabel,
  value,
  tone,
  highlight,
  valueClassName,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  fullLabel?: string;
  value: React.ReactNode;
  tone: keyof typeof TONE_BG;
  highlight?: boolean;
  valueClassName?: string;
}) {
  return (
    <div
      title={fullLabel ?? label}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] leading-none",
        "sm:gap-1.5 sm:rounded-lg sm:border sm:px-2 sm:py-1",
        TONE_BG[tone],
        highlight && "ring-1 ring-emerald-500/40",
      )}
    >
      <Icon className="h-3 w-3 shrink-0 opacity-80" />
      <span className={cn("font-display text-[11px] font-bold tabular-nums sm:text-[13px]", valueClassName)}>
        {value}
      </span>
      <span className="text-[9px] uppercase tracking-wider opacity-70">
        <span className="sm:hidden">{label}</span>
        <span className="hidden sm:inline">{fullLabel ?? label}</span>
      </span>
    </div>
  );
}

export default PublicLeaderboard;
