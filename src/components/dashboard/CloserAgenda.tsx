import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, User2, BadgeDollarSign, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCloserMeetings, type MeetingItem } from "@/hooks/useCloserAgenda";
import { CLOSERS } from "@/lib/closers";

const statusStyle: Record<MeetingItem["status"], string> = {
  agendado: "bg-warning/10 text-warning border-warning/30",
  compareceu: "bg-info/10 text-info border-info/30",
  fechou: "bg-success/10 text-success border-success/30",
  nao_compareceu: "bg-destructive/10 text-destructive border-destructive/30",
  perdido: "bg-muted text-muted-foreground border-border",
};
const statusLabel: Record<MeetingItem["status"], string> = {
  agendado: "Agendada",
  compareceu: "Compareceu",
  fechou: "Fechou",
  nao_compareceu: "Não compareceu",
  perdido: "Perdido",
};

function money(v: number | null) {
  if (!v) return null;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function MeetingRow({ m }: { m: MeetingItem }) {
  return (
    <Link
      to={`/leads?lead=${m.leadId}`}
      className="flex items-start gap-3 rounded-lg border border-border/70 bg-card px-3 py-2.5 transition-colors hover:bg-muted/40"
    >
      <span className="mt-0.5 rounded-md bg-primary/10 px-2 py-1 text-xs font-bold tabular-nums text-primary">
        {m.at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{m.leadName}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", statusStyle[m.status])}>
            {statusLabel[m.status]}
          </span>
          {m.isRescheduled && (
            <span className="inline-flex items-center gap-1 rounded-full border border-info/30 bg-info/10 px-2 py-0.5 text-[10px] font-semibold text-info">
              <RotateCcw className="h-3 w-3" />
              Reagendada
            </span>
          )}
          {m.value && (
            <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/5 px-2 py-0.5 text-[10px] font-semibold text-success">
              <BadgeDollarSign className="h-3 w-3" />
              {money(m.value)}
              {m.valueSource === "auto" && <span className="opacity-70">auto</span>}
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}

export function CloserAgenda({ scope }: { scope?: { tenantId?: string | null; memberId?: string | null } }) {
  const { start, end } = useMemo(() => {
    const s = new Date(); s.setHours(0, 0, 0, 0);
    const e = new Date(s); e.setDate(e.getDate() + 1);
    return { start: s, end: e };
  }, []);
  const { byCloser, meetings, isLoading } = useCloserMeetings(start, end, scope);

  return (
    <section className="rounded-2xl border bg-card p-4 md:p-5">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-foreground">
          <CalendarClock className="h-4 w-4 text-primary" />
          Agenda do dia · por closer
        </h2>
        <Link to="/agenda" className="text-xs font-semibold text-primary hover:underline">
          Ver agenda completa
        </Link>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {CLOSERS.map((c) => {
          const items = byCloser.map.get(c.id) ?? [];
          return (
            <div key={c.id} className="rounded-xl border border-border/70 bg-muted/10 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-bold">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: c.color }}>
                    {c.name.slice(0, 2).toUpperCase()}
                  </span>
                  {c.name}
                </span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary tabular-nums">
                  {items.length}
                </span>
              </div>
              <div className="space-y-2">
                {items.length === 0 && (
                  <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                    {isLoading ? "Carregando…" : "Nenhuma reunião hoje"}
                  </p>
                )}
                {items.map((m) => <MeetingRow key={m.leadId + m.at.toISOString()} m={m} />)}
              </div>
            </div>
          );
        })}
      </div>

      {byCloser.unassigned.length > 0 && (
        <div className="mt-3 rounded-xl border border-dashed p-3">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <User2 className="h-3.5 w-3.5" /> Sem closer definido ({byCloser.unassigned.length})
          </p>
          <div className="space-y-2">
            {byCloser.unassigned.map((m) => <MeetingRow key={m.leadId + m.at.toISOString()} m={m} />)}
          </div>
        </div>
      )}

      {!isLoading && meetings.length === 0 && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          As reuniões aparecem aqui assim que o consultor marcar “Reunião agendada” nos status do lead.
        </p>
      )}
    </section>
  );
}
