import { useMemo, useState } from "react";
import { ChevronDown, BarChart3, ArrowUp, ArrowDown, Minus } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
type Lead = {
  stage: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type Props = {
  leads: Lead[];
};

type WeekStats = {
  novos: number;
  emAtendimento: number;
  agendados: number;
  fechados: number;
  perdidos: number;
};

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay(); // 0 = domingo
  const diff = day === 0 ? -6 : 1 - day; // semana começa segunda
  date.setDate(date.getDate() + diff);
  return date;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function computeStats(leads: Lead[], from: Date, to: Date): WeekStats {
  const stats: WeekStats = { novos: 0, emAtendimento: 0, agendados: 0, fechados: 0, perdidos: 0 };
  for (const l of leads) {
    const created = l.created_at ? new Date(l.created_at) : null;
    const updated = l.updated_at ? new Date(l.updated_at) : null;
    if (created && created >= from && created < to) {
      stats.novos++;
    }
    // Para os demais usamos updated_at como proxy de quando entrou na fase
    if (updated && updated >= from && updated < to) {
      const stage = l.stage ?? "";
      if (stage === "atendimento") stats.emAtendimento++;
      else if (stage === "agendado" || stage === "compareceu") stats.agendados++;
      else if (stage === "comprou") stats.fechados++;
      else if (stage === "perdido") stats.perdidos++;
    }
  }
  return stats;
}

function formatRange(from: Date, to: Date): string {
  const end = addDays(to, -1);
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${fmt(from)} – ${fmt(end)}`;
}

function Delta({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (previous === 0 && current === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        <Minus className="h-3 w-3" /> 0
      </span>
    );
  }
  if (diff === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        <Minus className="h-3 w-3" /> igual
      </span>
    );
  }
  const pct = previous > 0 ? Math.round((diff / previous) * 100) : 100;
  const isUp = diff > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
        isUp ? "text-emerald-600" : "text-rose-600"
      }`}
    >
      {isUp ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {isUp ? "+" : ""}
      {diff} ({isUp ? "+" : ""}
      {pct}%)
    </span>
  );
}

const METRICS: { key: keyof WeekStats; label: string; color: string }[] = [
  { key: "novos", label: "Novos leads", color: "text-emerald-600" },
  { key: "emAtendimento", label: "Em atendimento", color: "text-sky-600" },
  { key: "agendados", label: "Agendados", color: "text-violet-600" },
  { key: "fechados", label: "Fechados", color: "text-amber-600" },
  { key: "perdidos", label: "Perdidos", color: "text-rose-600" },
];

export function WeekComparison({ leads }: Props) {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(1); // 1 = semana passada

  const { current, previous, currentRange, previousRange } = useMemo(() => {
    const thisWeekStart = startOfWeek(new Date());
    const thisWeekEnd = addDays(thisWeekStart, 7);
    const prevStart = addDays(thisWeekStart, -7 * offset);
    const prevEnd = addDays(prevStart, 7);
    return {
      current: computeStats(leads, thisWeekStart, thisWeekEnd),
      previous: computeStats(leads, prevStart, prevEnd),
      currentRange: formatRange(thisWeekStart, thisWeekEnd),
      previousRange: formatRange(prevStart, prevEnd),
    };
  }, [leads, offset]);

  const OFFSETS = [
    { value: 1, label: "Semana passada" },
    { value: 2, label: "2 semanas atrás" },
    { value: 3, label: "3 semanas atrás" },
    { value: 4, label: "4 semanas atrás" },
  ];

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="client-card rounded-2xl overflow-hidden">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40 md:px-5 md:py-4">
        <div className="flex items-center gap-2 min-w-0">
          <BarChart3 className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 text-left">
            <h2 className="font-display text-base font-semibold tracking-tight md:text-lg">
              Comparar com semanas anteriores
            </h2>
            <p className="text-xs text-muted-foreground">
              Veja a evolução semana a semana
            </p>
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-t border-border/60 px-4 py-4 md:px-5 md:py-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Comparar com:
            </span>
            {OFFSETS.map((o) => (
              <button
                key={o.value}
                onClick={() => setOffset(o.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  offset === o.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Semana atual
              </div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums">{currentRange}</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Período comparado
              </div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums">{previousRange}</div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Métrica</th>
                  <th className="px-3 py-2 text-right">Atual</th>
                  <th className="px-3 py-2 text-right">Anterior</th>
                  <th className="px-3 py-2 text-right">Variação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {METRICS.map((m) => (
                  <tr key={m.key}>
                    <td className="px-3 py-2.5">
                      <span className={`font-medium ${m.color}`}>{m.label}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-display font-bold tabular-nums">
                      {current[m.key]}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {previous[m.key]}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Delta current={current[m.key]} previous={previous[m.key]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Métricas calculadas a partir da data de criação (novos) e da última
            atualização do lead (demais fases) dentro de cada semana.
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
