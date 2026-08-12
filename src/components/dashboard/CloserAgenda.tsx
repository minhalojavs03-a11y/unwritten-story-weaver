import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, User2, BadgeDollarSign, RotateCcw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCloserMeetings, type MeetingItem } from "@/hooks/useCloserAgenda";
import { useTenantMembers } from "@/hooks/useData";
import { CLOSERS } from "@/lib/closers";

type Period = "today" | "tomorrow" | "week" | "month" | "all";

function rangeOf(p: Period): { start?: Date; end?: Date } {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  if (p === "all") return {};
  if (p === "today") { const e = new Date(start); e.setDate(e.getDate() + 1); return { start, end: e }; }
  if (p === "tomorrow") { const s = new Date(start); s.setDate(s.getDate() + 1); const e = new Date(s); e.setDate(e.getDate() + 1); return { start: s, end: e }; }
  if (p === "week") { const e = new Date(start); e.setDate(e.getDate() + 7); return { start, end: e }; }
  return { start: new Date(start.getFullYear(), start.getMonth(), 1), end: new Date(start.getFullYear(), start.getMonth() + 1, 1) };
}


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

function MeetingRow({ m, consultant, showDate }: { m: MeetingItem; consultant?: string; showDate?: boolean }) {
  return (
    <Link
      to={`/leads?lead=${m.leadId}`}
      className="flex items-start gap-3 rounded-lg border border-border/70 bg-card px-3 py-2.5 transition-colors hover:bg-muted/40"
    >
      <span className="mt-0.5 shrink-0 rounded-md bg-primary/10 px-2 py-1 text-center text-xs font-bold tabular-nums text-primary">
        {m.at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        {showDate && (
          <span className="block text-[9px] font-semibold opacity-70">
            {m.at.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{m.leadName}</span>
        {consultant && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <User2 className="h-3 w-3" /> {consultant}
          </span>
        )}
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
  const [period, setPeriod] = useState<Period>("today");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [closerFilter, setCloserFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { start, end } = useMemo(() => rangeOf(period), [period]);
  const { meetings, isLoading } = useCloserMeetings(start, end, scope);
  const { data: members = [] } = useTenantMembers();
  const memberName = (id: string | null) => members.find((m: any) => m.id === id)?.display_name ?? undefined;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return meetings.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (closerFilter !== "all" && (m.closerId ?? "none") !== closerFilter) return false;
      if (q && !m.leadName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [meetings, statusFilter, closerFilter, search]);

  const byCloser = useMemo(() => {
    const map = new Map<string, MeetingItem[]>();
    for (const c of CLOSERS) map.set(c.id, []);
    const unassigned: MeetingItem[] = [];
    for (const m of filtered) {
      if (m.closerId && map.has(m.closerId)) map.get(m.closerId)!.push(m);
      else unassigned.push(m);
    }
    return { map, unassigned };
  }, [filtered]);

  const totalValue = filtered.reduce((acc, m) => acc + (m.value ?? 0), 0);
  const showDate = period !== "today" && period !== "tomorrow";
  const periodLabel: Record<Period, string> = { today: "Hoje", tomorrow: "Amanhã", week: "7 dias", month: "Mês", all: "Total" };



  return (
    <section className="rounded-2xl border bg-card p-4 md:p-5">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-foreground">
          <CalendarClock className="h-4 w-4 text-primary" />
          Agenda · por closer
        </h2>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-bold text-success">
            <BadgeDollarSign className="h-3.5 w-3.5" />
            <span>Valor em pauta</span>
            <span className="tabular-nums">{money(totalValue) ?? "R$ 0"}</span>
          </span>
          <Link to="/agenda" className="text-xs font-semibold text-primary hover:underline">
            Ver agenda completa
          </Link>
        </div>
      </header>

      {/* Filtros */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-muted/20 p-2">
        {([
          { v: "today", l: "Hoje" },
          { v: "tomorrow", l: "Amanhã" },
          { v: "week", l: "7 dias" },
          { v: "month", l: "Mês" },
          { v: "all", l: "Todas" },
        ] as { v: Period; l: string }[]).map((o) => (
          <Button
            key={o.v}
            size="sm"
            variant={period === o.v ? "default" : "outline"}
            className="h-7 rounded-full px-3 text-xs"
            onClick={() => setPeriod(o.v)}
          >
            {o.l}
          </Button>
        ))}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.keys(statusLabel).map((k) => (
              <SelectItem key={k} value={k}>{statusLabel[k as MeetingItem["status"]]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={closerFilter} onValueChange={setCloserFilter}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os closers</SelectItem>
            {CLOSERS.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            <SelectItem value="none">Sem closer</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative ml-auto min-w-[160px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar lead…"
            className="h-8 rounded-full pl-8 text-xs"
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {CLOSERS.map((c) => {
          const items = byCloser.map.get(c.id) ?? [];
          const closed = items.filter((m) => m.status === "fechou").length;
          const rate = items.length ? Math.round((closed / items.length) * 100) : 0;
          const closedValue = items.filter((m) => m.status === "fechou").reduce((a, m) => a + (m.value ?? 0), 0);

          const monthItems = byCloserMonth.map.get(c.id) ?? [];
          const monthClosed = monthItems.filter((m) => m.status === "fechou").length;
          const monthRate = monthItems.length ? Math.round((monthClosed / monthItems.length) * 100) : 0;
          const monthClosedValue = monthItems.filter((m) => m.status === "fechou").reduce((a, m) => a + (m.value ?? 0), 0);

          return (
            <div key={c.id} className="rounded-xl border border-border/70 bg-muted/10 p-3">
              <div className="mb-2 rounded-lg border border-border/60 bg-card px-3 py-2.5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-bold">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: c.color }}>
                      {c.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="uppercase tracking-wide">{c.name}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary tabular-nums">
                      {items.length}
                    </span>
                    <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-bold text-success tabular-nums">
                      {rate}%
                    </span>
                  </span>
                </div>

                {/* Barra 1: período selecionado */}
                <div className="mt-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Taxa {periodLabel[period]} · {closed}/{items.length} fechados</span>
                  {closedValue > 0 && <span className="text-success">{money(closedValue)}</span>}
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-success transition-all"
                    style={{ width: `${rate}%`, background: rate > 0 ? undefined : "transparent" }}
                  />
                </div>

                {/* Barra 2: mês */}
                <div className="mt-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Taxa Mês · {monthClosed}/{monthItems.length} fechados</span>
                  {monthClosedValue > 0 && <span className="text-success">{money(monthClosedValue)}</span>}
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-info transition-all"
                    style={{ width: `${monthRate}%`, background: monthRate > 0 ? undefined : "transparent" }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                {items.length === 0 && (
                  <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                    {isLoading || isLoadingMonth ? "Carregando…" : "Nenhuma reunião neste filtro"}
                  </p>
                )}
                {items.map((m) => (
                  <MeetingRow key={m.leadId + m.at.toISOString()} m={m} consultant={memberName(m.consultantMemberId)} showDate={showDate} />
                ))}
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
            {byCloser.unassigned.map((m) => (
              <MeetingRow key={m.leadId + m.at.toISOString()} m={m} consultant={memberName(m.consultantMemberId)} showDate={showDate} />
            ))}
          </div>
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          As reuniões aparecem aqui assim que o consultor marcar “Reunião agendada” nos status do lead.
        </p>
      )}
    </section>
  );
}

