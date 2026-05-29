import { MonthlyGoalBar } from "./MonthlyGoalBar";

interface Props {
  totalLeads: number;
  totalAppointments: number;
  conversionRate: number; // %
  avgResponseMinutes: number;
  monthlyGoal: number;
}

function StatMini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="font-mono text-xl font-bold tabular-nums text-foreground md:text-2xl">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function PerformanceStats({
  totalLeads, totalAppointments, conversionRate, avgResponseMinutes, monthlyGoal,
}: Props) {
  return (
    <section className="rounded-2xl border bg-card p-5 md:p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-display text-lg font-semibold">Desempenho</h2>
        <span className="text-xs text-muted-foreground">Últimos 30 dias</span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatMini label="Leads" value={totalLeads} />
        <StatMini label="Atendimentos" value={totalAppointments} />
        <StatMini label="Conversão" value={`${conversionRate.toFixed(0)}%`} />
        <StatMini label="T. Resposta" value={`${avgResponseMinutes} min`} />
      </div>
      <div className="mt-5">
        <MonthlyGoalBar current={totalAppointments} goal={monthlyGoal} label="Meta mensal de atendimentos" />
      </div>
    </section>
  );
}
