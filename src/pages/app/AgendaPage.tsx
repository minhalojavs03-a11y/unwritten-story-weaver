import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "./PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CalendarClock, BadgeDollarSign, User2, Search } from "lucide-react";
import { useCloserMeetings, type MeetingItem } from "@/hooks/useCloserAgenda";
import { CLOSERS } from "@/lib/closers";
import { useTenantMembers } from "@/hooks/useData";

type Period = "today" | "tomorrow" | "week" | "month" | "all";

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

function rangeOf(p: Period): { start?: Date; end?: Date } {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  if (p === "all") return {};
  if (p === "today") { const e = new Date(start); e.setDate(e.getDate() + 1); return { start, end: e }; }
  if (p === "tomorrow") { const s = new Date(start); s.setDate(s.getDate() + 1); const e = new Date(s); e.setDate(e.getDate() + 1); return { start: s, end: e }; }
  if (p === "week") { const e = new Date(start); e.setDate(e.getDate() + 7); return { start, end: e }; }
  const e = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  return { start: new Date(start.getFullYear(), start.getMonth(), 1), end: e };
}

export default function AgendaPage() {
  const [period, setPeriod] = useState<Period>("today");
  const [closerFilter, setCloserFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { start, end } = useMemo(() => rangeOf(period), [period]);
  const { meetings, isLoading } = useCloserMeetings(start, end);
  const { data: members = [] } = useTenantMembers();
  const memberName = (id: string | null) => members.find((m: any) => m.id === id)?.display_name ?? "—";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return meetings.filter((m) => {
      if (closerFilter !== "all" && (m.closerId ?? "none") !== closerFilter) return false;
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (q && !m.leadName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [meetings, closerFilter, statusFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, MeetingItem[]>();
    for (const m of filtered) {
      const key = m.at.toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const totalValue = filtered.reduce((acc, m) => acc + (m.value ?? 0), 0);

  return (
    <>
      <PageHeader title="Agenda de reuniões" subtitle="Baseada nas anotações dos consultores" />
      <div className="space-y-3 p-3 md:p-8">
        {/* Resumo por closer */}
        <div className="grid gap-2 sm:grid-cols-3">
          {CLOSERS.map((c) => {
            const items = filtered.filter((m) => m.closerId === c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCloserFilter(closerFilter === c.id ? "all" : c.id)}
                className={cn(
                  "flex items-center justify-between rounded-xl border bg-card p-3 text-left transition-colors",
                  closerFilter === c.id ? "border-primary ring-1 ring-primary/40" : "hover:bg-muted/40",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: c.color }}>
                    {c.name.slice(0, 2).toUpperCase()}
                  </span>
                  {c.name}
                </span>
                <span className="text-lg font-bold tabular-nums text-primary">{items.length}</span>
              </button>
            );
          })}
          <div className="flex items-center justify-between rounded-xl border bg-card p-3">
            <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <BadgeDollarSign className="h-4 w-4 text-success" /> Valor em pauta
            </span>
            <span className="text-sm font-bold tabular-nums text-success">{money(totalValue) ?? "R$ 0"}</span>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2.5">
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
            <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.keys(statusLabel).map((k) => (
                <SelectItem key={k} value={k}>{statusLabel[k as MeetingItem["status"]]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={closerFilter} onValueChange={setCloserFilter}>
            <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os closers</SelectItem>
              {CLOSERS.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              <SelectItem value="none">Sem closer</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative ml-auto min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar lead…"
              className="h-8 rounded-full pl-8 text-xs"
            />
          </div>
        </div>

        {/* Listagem */}
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!isLoading && filtered.length === 0 && (
          <div className="rounded-xl border bg-card p-12 text-center">
            <CalendarClock className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">
              Nenhuma reunião neste filtro. Elas aparecem aqui quando o consultor marca “Reunião agendada” nos status do lead.
            </p>
          </div>
        )}

        {grouped.map(([day, items]) => (
          <div key={day} className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
              <span className="text-xs font-bold uppercase tracking-wide">
                {new Date(day).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground">{items.length} reunião(ões)</span>
            </div>
            <ul className="divide-y">
              {items.map((m) => (
                <li key={m.leadId + m.at.toISOString()}>
                  <Link to={`/app/leads?lead=${m.leadId}`} className="flex flex-wrap items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/40">
                    <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-bold tabular-nums text-primary">
                      {m.at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{m.leadName}</span>
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <User2 className="h-3 w-3" /> Consultor: {memberName(m.consultantMemberId)}
                      </span>
                    </span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold">
                      {m.closerName ?? "Sem closer"}
                    </span>
                    {m.value && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/5 px-2 py-0.5 text-[11px] font-semibold text-success">
                        {money(m.value)}{m.valueSource === "auto" && <span className="opacity-70">auto</span>}
                      </span>
                    )}
                    <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", statusStyle[m.status])}>
                      {statusLabel[m.status]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}
