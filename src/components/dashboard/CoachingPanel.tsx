import { Link } from "react-router-dom";
import { Sparkles, AlertTriangle, Mic, ArrowRight, FileCheck2 } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useCoachingByMember } from "@/hooks/useCoachingInsights";
import { useTenantMembers } from "@/hooks/useData";

export function CoachingPanel({ days = 30 }: { days?: number }) {
  const { data: byMember = {}, isLoading } = useCoachingByMember(days);
  const { data: members = [] } = useTenantMembers();

  const memberMap = new Map(members.map((m: any) => [m.id, m]));
  const rows = Object.values(byMember)
    .filter((r) => memberMap.has(r.member_id))
    .map((r) => ({ ...r, member: memberMap.get(r.member_id) as any }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  const totals = Object.values(byMember).reduce(
    (acc, r) => {
      acc.total += r.total;
      acc.high += r.high;
      acc.missed += r.missed_signal;
      acc.audio += r.should_be_audio;
      acc.sims += r.simulations ?? 0;
      return acc;
    },
    { total: 0, high: 0, missed: 0, audio: 0, sims: 0 },
  );

  return (
    <div className="client-card rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3 md:px-5 md:py-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="font-display text-base font-semibold tracking-tight md:text-lg">
            Coaching IA por consultor
          </h2>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            · {days}d
          </span>
        </div>
        <Link to="/coaching" className="shrink-0 text-xs font-medium text-primary hover:underline">
          Abrir Coaching →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-border/60 px-4 py-3 md:grid-cols-4 md:px-5">
        <Metric label="Alertas abertos" value={totals.total} tone="default" />
        <Metric label="Sinal perdido" value={totals.missed} tone="red" icon={AlertTriangle} />
        <Metric label="Devia ser áudio" value={totals.audio} tone="amber" icon={Mic} />
        <Metric label="Simulações" value={totals.sims} tone="emerald" icon={FileCheck2} />
      </div>

      {isLoading ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground md:px-5">
          Carregando análises…
        </div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground md:px-5">
          Nenhum alerta aberto. Atendimento da equipe está alinhado. 🎯
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.map((r) => {
            const score = Math.max(0, 100 - r.total * 6 - r.high * 8);
            const tone =
              r.high > 0
                ? "text-red-600"
                : r.total > 5
                  ? "text-amber-600"
                  : "text-emerald-600";
            return (
              <li key={r.member_id}>
                <Link
                  to="/coaching"
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 md:px-5"
                >
                  <UserAvatar
                    name={r.member.display_name ?? ""}
                    avatarColor={r.member.avatar_color}
                    avatarUrl={r.member.avatar_url}
                    size={32}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{r.member.display_name}</p>
                      <span className={`shrink-0 font-display text-sm font-bold tabular-nums ${tone}`}>
                        {score}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-medium">
                        {r.total} alertas
                      </span>
                      {r.missed_signal > 0 && (
                        <span className="rounded bg-red-50 px-1.5 py-0.5 font-medium text-red-700">
                          {r.missed_signal} sinal perdido
                        </span>
                      )}
                      {r.should_be_audio > 0 && (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">
                          {r.should_be_audio} áudio
                        </span>
                      )}
                      {r.high > 0 && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 font-bold uppercase tracking-wide text-red-700">
                          {r.high} crítico{r.high > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: "default" | "red" | "amber" | "emerald";
  icon?: any;
}) {
  const color =
    tone === "red"
      ? "text-red-600"
      : tone === "amber"
        ? "text-amber-600"
        : tone === "emerald"
          ? "text-emerald-600"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className={`mt-0.5 font-display text-xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
