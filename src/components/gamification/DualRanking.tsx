import { Trophy, Crown, Target, Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { cn } from "@/lib/utils";
import { useRanking, sortByPerformance, type RankingRow } from "@/hooks/useGamification";

/**
 * Ranking oficial de avaliação dos consultores.
 * Posições definidas por VENDAS e, em empate, REUNIÕES AGENDADAS.
 * Duas colunas no desktop: mês atual e todo o período.
 */
export function DualRanking({ highlightMemberId, className }: { highlightMemberId?: string | null; className?: string }) {
  const { data: monthly = [] } = useRanking("monthly");
  const { data: all = [] } = useRanking("all");

  return (
    <div className={cn("grid gap-4 lg:grid-cols-2", className)}>
      <RankingColumn title="Ranking do mês" subtitle="Mês atual" rows={monthly} highlightMemberId={highlightMemberId} />
      <RankingColumn title="Ranking geral" subtitle="Todo o período" rows={all} highlightMemberId={highlightMemberId} />
    </div>
  );
}

function RankingColumn({
  title, subtitle, rows, highlightMemberId,
}: { title: string; subtitle: string; rows: RankingRow[]; highlightMemberId?: string | null }) {
  const sorted = sortByPerformance(rows);
  const leader = sorted[0];

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          <h3 className="font-display text-sm font-semibold tracking-tight">{title}</h3>
        </div>
        <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{subtitle}</span>
      </div>

      {sorted.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Sem dados neste período.</div>
      ) : (
        <ul className="divide-y divide-border/60">
          {sorted.map((row, i) => {
            const isMe = highlightMemberId && row.member_id === highlightMemberId;
            const gap = leader ? Math.max(0, Number(leader.sales ?? 0) - Number(row.sales ?? 0)) : 0;
            return (
              <li
                key={row.member_id}
                className={cn(
                  "relative flex items-center gap-3 px-4 py-2.5 transition-colors",
                  isMe ? "bg-primary/5" : "hover:bg-muted/40",
                )}
              >
                {isMe && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-primary" />}
                <div className="flex w-6 shrink-0 items-center justify-center">
                  {i === 0 ? (
                    <Crown className="h-4 w-4 text-amber-500" />
                  ) : (
                    <span className="font-display text-sm font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                  )}
                </div>

                <UserAvatar
                  userId={row.member_id}
                  name={row.display_name}
                  avatarUrl={row.avatar_url}
                  avatarColor={row.avatar_color ?? undefined}
                  size={32}
                />

                <div className="min-w-0 flex-1">
                  <div className={cn("truncate text-sm font-semibold", isMe && "text-primary")}>
                    {row.display_name}
                    {isMe && <span className="ml-1 text-[10px] font-medium text-primary/80">(você)</span>}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {i === 0 ? "líder" : gap > 0 ? `-${gap} ${gap === 1 ? "venda" : "vendas"}` : "empatado em vendas"}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Metric icon={Target} value={Number(row.sales ?? 0)} label="vendas" tone="emerald" />
                  <Metric icon={Calendar} value={Number(row.meetings ?? 0)} label="reuniões" tone="sky" />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

const TONES: Record<string, string> = {
  emerald: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  sky: "bg-sky-500/10 text-sky-700 border-sky-500/20",
};

function Metric({
  icon: Icon, value, label, tone,
}: { icon: React.ComponentType<{ className?: string }>; value: number; label: string; tone: keyof typeof TONES }) {
  return (
    <div title={label} className={cn("inline-flex items-center gap-1 rounded-lg border px-2 py-1", TONES[tone])}>
      <Icon className="h-3 w-3 shrink-0 opacity-80" />
      <span className="font-display text-[13px] font-bold tabular-nums">{value}</span>
    </div>
  );
}

export default DualRanking;
