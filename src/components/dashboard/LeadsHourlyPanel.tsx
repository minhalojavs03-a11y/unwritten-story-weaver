import { useMemo } from "react";
import { Clock, TrendingUp, ShieldAlert } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLeads } from "@/hooks/useData";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type Period = 7 | 30 | 90;

export function LeadsHourlyPanel({ days = 30 }: { days?: Period }) {
  const { data: leads = [], isLoading } = useLeads();

  const { hourly, weekday, peakHour, peakDay, total, analyzed, excludedDay, excludedCount, topRanges, topShare } = useMemo(() => {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    // Coleta leads dentro da janela
    const inWindow = leads
      .map((l) => (l.created_at ? new Date(l.created_at) : null))
      .filter((d): d is Date => !!d && d.getTime() >= since);

    // Detecta "dia de bulk import": agrupa por data e exclui qualquer dia
    // cujo total seja >= 3x a mediana dos demais dias (típico de importação inicial da planilha).
    const byDateKey: Record<string, number> = {};
    for (const d of inWindow) {
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      byDateKey[key] = (byDateKey[key] ?? 0) + 1;
    }
    const dayCounts = Object.entries(byDateKey).sort((a, b) => b[1] - a[1]);
    let excludedDay: string | null = null;
    let excludedCount = 0;
    if (dayCounts.length >= 2) {
      const others = dayCounts.slice(1).map(([, c]) => c).sort((a, b) => a - b);
      const median = others[Math.floor(others.length / 2)] || 1;
      const [topKey, topCount] = dayCounts[0];
      if (topCount >= Math.max(10, median * 3)) {
        excludedDay = topKey;
        excludedCount = topCount;
      }
    }

    // Cutoff: começa a contar a partir do FIM do dia de importação em massa
    let cutoff = 0;
    if (excludedDay) {
      const [y, mo, dd] = excludedDay.split("-").map(Number);
      cutoff = new Date(y, mo, dd + 1, 0, 0, 0, 0).getTime();
    }

    const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, label: `${String(h).padStart(2, "0")}h`, count: 0 }));
    const byDay = Array.from({ length: 7 }, (_, d) => ({ day: d, label: WEEKDAYS[d], count: 0 }));
    let total = leads.length; // total geral (todos os leads, sem filtro)
    let analyzed = 0;
    for (const d of inWindow) {
      if (d.getTime() < cutoff) continue;
      byHour[d.getHours()].count += 1;
      byDay[d.getDay()].count += 1;
      analyzed += 1;
    }
    const peakHour = byHour.reduce((a, b) => (b.count > a.count ? b : a), byHour[0]);
    const peakDay = byDay.reduce((a, b) => (b.count > a.count ? b : a), byDay[0]);
    // Top janelas de horário (3 horas com mais leads, agrupadas em faixas contíguas)
    const sortedHours = [...byHour].filter((h) => h.count > 0).sort((a, b) => b.count - a.count);
    const topHours = sortedHours.slice(0, 4).map((h) => h.hour).sort((a, b) => a - b);
    const ranges: Array<{ start: number; end: number }> = [];
    for (const h of topHours) {
      const last = ranges[ranges.length - 1];
      if (last && h === last.end + 1) last.end = h;
      else ranges.push({ start: h, end: h });
    }
    const topShare = analyzed > 0
      ? Math.round((sortedHours.slice(0, 4).reduce((s, h) => s + h.count, 0) / analyzed) * 100)
      : 0;
    return { hourly: byHour, weekday: byDay, peakHour, peakDay, total, analyzed, excludedDay, excludedCount, topRanges: ranges, topShare };
  }, [leads, days]);

  const maxHour = Math.max(1, ...hourly.map((h) => h.count));

  return (
    <div className="client-card rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3 md:px-5 md:py-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h2 className="font-display text-base font-semibold tracking-tight md:text-lg">
            Horários com mais leads
          </h2>
        </div>
        <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Últimos {days} dias
        </span>
      </div>


      <div className="grid gap-4 px-3 py-4 md:px-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)_minmax(0,1fr)] lg:items-stretch">
        {/* Coluna 1: stats + aviso */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Total de leads" value={total} hint={excludedDay ? "todos os leads" : undefined} />
            <Stat
              label="Horário de pico"
              value={analyzed ? `${String(peakHour.hour).padStart(2, "0")}h` : "—"}
              hint={analyzed ? `${peakHour.count} leads` : undefined}
            />
            <Stat
              label="Dia mais ativo"
              value={analyzed ? peakDay.label : "—"}
              hint={analyzed ? `${peakDay.count} leads` : undefined}
            />
            {analyzed > 0 && topRanges.length > 0 && (
              <Stat
                label="Janelas-chave"
                value={topRanges
                  .map((r) =>
                    r.start === r.end
                      ? `${String(r.start).padStart(2, "0")}h`
                      : `${String(r.start).padStart(2, "0")}-${String(r.end + 1).padStart(2, "0")}h`,
                  )
                  .join(" · ")}
                hint={topShare > 0 ? `~${topShare}% dos leads` : undefined}
              />
            )}
          </div>

          {analyzed > 0 && topRanges.length > 0 && (
            <div className="rounded-xl border-2 border-amber-500/40 bg-gradient-to-br from-amber-200/40 via-amber-100/30 to-yellow-100/20 p-3 shadow-[0_4px_18px_-8px_rgba(217,119,6,0.25)]">
              <div className="flex items-start gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-500 ring-1 ring-amber-500/20 animate-pulse">
                  <ShieldAlert className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="font-display text-[13px] font-bold tracking-tight text-foreground">
                      Cobertura crítica
                    </h3>
                    <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-amber-700 dark:text-amber-300">
                      24/7
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] leading-snug text-foreground/90">
                    Garanta <span className="font-bold text-foreground">1–2 consultores</span> ativos nas janelas de pico e mantenha <span className="font-bold text-foreground">revezamento</span> para responder na mesma hora.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Coluna 2: gráfico por hora */}
        <div className="flex min-w-0 flex-col">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Por hora do dia
          </h3>
          {isLoading ? (
            <div className="flex-1 min-h-[220px] animate-pulse rounded-xl bg-muted/40" />
          ) : analyzed === 0 ? (
            <div className="flex flex-1 min-h-[220px] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <TrendingUp className="h-6 w-6 opacity-50" />
              Sem leads suficientes para gerar o gráfico ainda.
            </div>
          ) : (
            <div className="flex-1 min-h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourly} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    interval={1}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                    formatter={(v: number) => [`${v} leads`, "Entradas"]}
                    labelFormatter={(l) => `${l}`}
                  />
                  <defs>
                    <linearGradient id="hourBarBase" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(357 75% 50%)" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="hsl(357 75% 50%)" stopOpacity={0.45} />
                    </linearGradient>
                    <linearGradient id="hourBarPeak" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--stage-scheduled))" stopOpacity={1} />
                      <stop offset="100%" stopColor="hsl(var(--stage-service))" stopOpacity={0.95} />
                    </linearGradient>
                  </defs>
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {hourly.map((h) => (
                      <Cell
                        key={h.hour}
                        fill={h.count === maxHour && maxHour > 0
                          ? "url(#hourBarPeak)"
                          : "url(#hourBarBase)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Coluna 3: gráfico por dia da semana */}
        <div className="flex min-w-0 flex-col">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Por dia da semana
          </h3>
          {analyzed === 0 ? (
            <div className="flex flex-1 min-h-[220px] items-center justify-center text-center text-xs text-muted-foreground">
              Sem dados ainda.
            </div>
          ) : (
            (() => {
              const maxDay = Math.max(1, ...weekday.map((x) => x.count));
              const totalWk = weekday.reduce((s, d) => s + d.count, 0) || 1;
              // Paleta dominada pelo vermelho (identidade) + acentos quentes/neutros
              const DAY_COLORS = [
                "hsl(357 75% 50%)",   // Dom — vermelho (identidade)
                "hsl(12 76% 55%)",    // Seg — vermelho-coral
                "hsl(25 85% 55%)",    // Ter — laranja queimado
                "hsl(38 92% 50%)",    // Qua — âmbar
                "hsl(0 65% 38%)",     // Qui — vinho escuro
                "hsl(345 70% 45%)",   // Sex — carmim
                "hsl(20 15% 45%)",    // Sáb — neutro morno
              ];
              return (
                <div className="flex flex-1 min-h-[220px] flex-col">
                  <div className="relative flex-1 min-h-[160px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Tooltip
                          contentStyle={{
                            background: "hsl(var(--popover))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: 10,
                            fontSize: 12,
                          }}
                          formatter={(v: number, _n, p: any) => [
                            `${v} leads · ${Math.round((v / totalWk) * 100)}%`,
                            p?.payload?.label,
                          ]}
                        />
                        <Pie
                          data={weekday}
                          dataKey="count"
                          nameKey="label"
                          innerRadius="62%"
                          outerRadius="92%"
                          paddingAngle={2}
                          stroke="hsl(var(--background))"
                          strokeWidth={2}
                          startAngle={90}
                          endAngle={-270}
                        >
                          {weekday.map((d) => {
                            const isPeak = d.count === maxDay && maxDay > 0;
                            const base = DAY_COLORS[d.day];
                            return (
                              <Cell
                                key={d.day}
                                fill={base}
                                fillOpacity={isPeak ? 1 : 0.55}
                              />
                            );
                          })}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Pico
                      </span>
                      <span
                        className="font-display text-xl font-bold tracking-tight"
                        style={{ color: DAY_COLORS[peakDay.day] }}
                      >
                        {peakDay.label}
                      </span>
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {peakDay.count} · {Math.round((peakDay.count / totalWk) * 100)}%
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-7 gap-1">
                    {weekday.map((d) => {
                      const isPeak = d.count === maxDay && maxDay > 0;
                      return (
                        <div key={d.day} className="flex flex-col items-center gap-0.5">
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{
                              background: DAY_COLORS[d.day],
                              opacity: isPeak ? 1 : 0.55,
                            }}
                          />
                          <span className="text-[10px] font-medium text-muted-foreground">
                            {d.label}
                          </span>
                          <span className="text-[10px] tabular-nums text-foreground">
                            {d.count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-display text-xl font-bold tracking-tight">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
