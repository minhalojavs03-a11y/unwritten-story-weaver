import { Crown, Trophy, Medal, Award, Target, Calendar as CalendarIcon, Handshake } from "lucide-react";
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

const PODIUM = [
  { icon: Crown, ring: "ring-amber-400/60", bg: "from-amber-400/25 via-amber-300/10 to-transparent", chip: "bg-amber-500 text-white", label: "MVP", badge: "1º" },
  { icon: Trophy, ring: "ring-slate-300/60", bg: "from-slate-300/25 via-slate-200/10 to-transparent", chip: "bg-slate-400 text-white", label: "Vice", badge: "2º" },
  { icon: Medal, ring: "ring-orange-400/60", bg: "from-orange-400/20 via-orange-300/10 to-transparent", chip: "bg-orange-500 text-white", label: "3º lugar", badge: "3º" },
] as const;

export function MvpOfMonth({ rows, highlightMemberId }: MvpOfMonthProps) {
  const top3 = rows.slice(0, 3);
  const leader = top3[0];
  const runnerUp = top3[1];
  const lead = leader && runnerUp ? leader.sales - runnerUp.sales : 0;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-background to-background shadow-[0_8px_30px_-15px_hsl(var(--primary)/0.4)]">
      {/* glow */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative flex items-center justify-between gap-3 border-b border-amber-500/20 px-4 py-3 md:px-5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/30">
            <Crown className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <h2 className="font-display text-sm font-bold tracking-tight md:text-base">MVP do mês</h2>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {monthLabel()} · quem chegar em 1º leva
            </p>
          </div>
        </div>
        <Link
          to="/ranking"
          className="shrink-0 rounded-full bg-amber-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700 ring-1 ring-amber-500/30 hover:bg-amber-500/25"
        >
          Ver ranking
        </Link>
      </div>

      {top3.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground md:px-5">
          Ainda não há vendas neste mês — seja o primeiro a marcar e dispute o MVP! 🏆
        </div>
      ) : (
        <div className="relative space-y-3 px-4 py-4 md:px-5 md:py-5">
          {/* Líder em destaque */}
          {leader && (
            <div className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${PODIUM[0].bg} p-4 ring-1 ${PODIUM[0].ring}`}>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <InitialsAvatar
                    name={leader.display_name}
                    src={leader.avatar_url ?? undefined}
                    className="h-14 w-14 text-lg"
                  />
                  <span className={`absolute -bottom-1 -right-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold shadow ${PODIUM[0].chip}`}>
                    1º
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white shadow">
                      MVP atual
                    </span>
                    {highlightMemberId === leader.member_id && (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-primary">
                        Você
                      </span>
                    )}
                  </div>
                  <h3 className="mt-0.5 truncate font-display text-base font-bold tracking-tight md:text-lg">
                    {leader.display_name}
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    {leader.role_label ?? "Consultor"}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <Stat icon={Award} label="Vendas" value={leader.sales} tone="amber" />
                <Stat icon={CalendarIcon} label="Reuniões" value={leader.meetings} tone="sky" />
                <Stat icon={Handshake} label="Contatos" value={leader.contacts} tone="violet" />
              </div>

              {runnerUp && lead > 0 && (
                <div className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-background/60 px-3 py-1.5 text-[11px] font-medium text-foreground backdrop-blur">
                  <Target className="h-3 w-3 text-amber-600" />
                  <span>
                    {lead} venda{lead === 1 ? "" : "s"} à frente do 2º lugar
                  </span>
                </div>
              )}
              {runnerUp && lead === 0 && (
                <div className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-background/60 px-3 py-1.5 text-[11px] font-bold text-rose-600 backdrop-blur">
                  <Target className="h-3 w-3" />
                  <span>Empate técnico — disputa aberta!</span>
                </div>
              )}
            </div>
          )}

          {/* 2º e 3º */}
          {(runnerUp || top3[2]) && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[runnerUp, top3[2]].map((row, i) => {
                if (!row) return null;
                const cfg = PODIUM[i + 1];
                const gap = leader ? leader.sales - row.sales : 0;
                return (
                  <div
                    key={row.member_id}
                    className={`relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br ${cfg.bg} p-3`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="relative shrink-0">
                        <InitialsAvatar
                          name={row.display_name}
                          src={row.avatar_url ?? undefined}
                          className="h-10 w-10 text-sm"
                        />
                        <span className={`absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold shadow ${cfg.chip}`}>
                          {cfg.badge}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                            {cfg.label}
                          </span>
                          {highlightMemberId === row.member_id && (
                            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-primary">
                              Você
                            </span>
                          )}
                        </div>
                        <h4 className="truncate font-display text-sm font-bold tracking-tight">
                          {row.display_name}
                        </h4>
                        <p className="text-[10px] text-muted-foreground">
                          {row.sales} vendas · {row.meetings} reuniões
                          {gap > 0 && (
                            <span className="ml-1 text-amber-700">
                              · {gap} para o topo
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Award;
  label: string;
  value: number;
  tone: "amber" | "sky" | "violet";
}) {
  const tones: Record<string, string> = {
    amber: "bg-amber-500/15 text-amber-700 ring-amber-500/25",
    sky: "bg-sky-500/15 text-sky-700 ring-sky-500/25",
    violet: "bg-violet-500/15 text-violet-700 ring-violet-500/25",
  };
  return (
    <div className="rounded-lg bg-background/70 px-2.5 py-2 ring-1 ring-border/60 backdrop-blur">
      <div className="flex items-center gap-1.5">
        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-md ring-1 ${tones[tone]}`}>
          <Icon className="h-3 w-3" />
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="mt-1 font-display text-lg font-bold tabular-nums leading-none tracking-tight">
        {value}
      </div>
    </div>
  );
}
