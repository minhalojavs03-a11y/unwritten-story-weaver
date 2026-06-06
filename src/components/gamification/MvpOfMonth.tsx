import { Crown, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { InitialsAvatar } from "@/components/oticaflow/Avatar";
import type { RankingRow } from "@/hooks/useGamification";

interface MvpOfMonthProps {
  rows: RankingRow[];
  highlightMemberId?: string | null;
}

const monthLabel = () => {
  const d = new Date();
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    .replace(/^./, (c) => c.toUpperCase());
};

export function MvpOfMonth({ rows, highlightMemberId }: MvpOfMonthProps) {
  const top3 = rows.slice(0, 3);
  const leader = top3[0];
  const runnerUp = top3[1];
  const third = top3[2];
  const lead = leader && runnerUp ? leader.sales - runnerUp.sales : 0;
  const tie = !!(leader && runnerUp && lead === 0);

  if (!leader) {
    return (
      <section className="overflow-hidden rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-background to-background px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-600" />
            <div>
              <h2 className="font-display text-sm font-bold tracking-tight">MVP do mês</h2>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {monthLabel()} · quem chegar em 1º leva
              </p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground">
            Sem vendas ainda — seja o primeiro! 🏆
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-amber-500/30 bg-card shadow-[0_4px_16px_-8px_hsl(var(--primary)/0.3)]">
      <div className="flex flex-col items-stretch lg:flex-row">
        {/* MVP destaque */}
        <div className="relative flex min-w-[280px] items-center gap-3 bg-gradient-to-br from-amber-500 to-amber-600 px-4 py-3 text-white">
          <div className="relative shrink-0">
            <InitialsAvatar
              name={leader.display_name}
              src={leader.avatar_url ?? undefined}
              className="h-11 w-11 text-base ring-2 ring-white/40"
            />
            <span className="absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white bg-yellow-300 text-[10px] font-black text-amber-900">
              1º
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-50">
                MVP atual
              </span>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
              {highlightMemberId === leader.member_id && (
                <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider">
                  Você
                </span>
              )}
            </div>
            <h3 className="truncate font-display text-sm font-bold leading-tight md:text-base">
              {leader.display_name}
            </h3>
            <p className="truncate text-[10px] font-medium text-amber-50/90">
              {leader.role_label ?? "Consultor"}
            </p>
          </div>
        </div>

        {/* Métricas inline */}
        <div className="flex flex-1 items-center justify-around border-y border-border/60 px-4 py-2 lg:border-y-0 lg:border-r">
          <Metric label="Vendas" value={leader.sales} />
          <span className="h-7 w-px bg-border" />
          <Metric label="Reuniões" value={leader.meetings} accent />
          <span className="h-7 w-px bg-border" />
          <Metric label="Contatos" value={leader.contacts} />
        </div>

        {/* Vice + 3º + alerta + CTA */}
        <div className="flex flex-wrap items-center gap-3 bg-muted/30 px-4 py-2">
          {runnerUp && (
            <RunnerUp row={runnerUp} label="Vice" highlight={highlightMemberId === runnerUp.member_id} />
          )}
          {third && (
            <RunnerUp row={third} label="3º lugar" highlight={highlightMemberId === third.member_id} />
          )}

          <div className="flex items-center gap-2">
            {tie && (
              <div className="flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 dark:border-rose-900/50 dark:bg-rose-950/40">
                <AlertTriangle className="h-3 w-3 text-rose-600 dark:text-rose-400" />
                <span className="text-[9px] font-black uppercase tracking-tight text-rose-700 dark:text-rose-300">
                  Empate em aberto
                </span>
              </div>
            )}
            {!tie && lead > 0 && (
              <span className="text-[10px] font-medium text-muted-foreground">
                {lead} venda{lead === 1 ? "" : "s"} de vantagem
              </span>
            )}
            <Link
              to="/ranking"
              className="whitespace-nowrap rounded-md bg-amber-500/15 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-amber-700 ring-1 ring-amber-500/30 transition-colors hover:bg-amber-500 hover:text-white"
            >
              Ver ranking
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] font-bold uppercase tracking-tight text-muted-foreground">
        {label}
      </span>
      <span className={`font-display text-xl font-extrabold tabular-nums leading-none ${accent ? "text-amber-600" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

function RunnerUp({ row, label, highlight }: { row: RankingRow; label: string; highlight: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <InitialsAvatar
        name={row.display_name}
        src={row.avatar_url ?? undefined}
        className="h-9 w-9 text-xs ring-2 ring-border"
      />
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          {highlight && (
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[8px] font-bold uppercase text-primary">
              Você
            </span>
          )}
        </div>
        <p className="truncate text-xs font-bold text-foreground">{row.display_name}</p>
      </div>
    </div>
  );
}
