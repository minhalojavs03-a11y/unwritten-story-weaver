import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, User2, BadgeDollarSign, RotateCcw, Search, GripVertical, Plus, Moon } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCloserMeetings, type MeetingItem } from "@/hooks/useCloserAgenda";
import { useTenantMembers, useUpdateLead, useLeads } from "@/hooks/useData";
import { useIsMobile } from "@/hooks/use-mobile";
import { CLOSERS } from "@/lib/closers";
import { useActiveMember } from "@/contexts/ActiveMemberContext";


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

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Slots do dia (30 em 30 minutos). Expediente padrão encerra às 18h. */
const SLOT_START_HOUR = 8;
const SLOT_END_HOUR = 18;
const NIGHT_END_HOUR = 21;
function buildSlots(from: number, to: number): string[] {
  const out: string[] = [];
  for (let h = from; h <= to; h++) {
    out.push(`${pad(h)}:00`);
    if (h !== to) out.push(`${pad(h)}:30`);
  }
  return out;
}
function daySlots(): string[] {
  return buildSlots(SLOT_START_HOUR, SLOT_END_HOUR);
}
/** 18:30 → 21:00 (horários extras, liberados por closer). */
function nightSlots(): string[] {
  return buildSlots(SLOT_END_HOUR, NIGHT_END_HOUR).filter((s) => s > `${pad(SLOT_END_HOUR)}:00`);
}
const isNightSlot = (s: string) => s > `${pad(SLOT_END_HOUR)}:00`;

const NIGHT_KEY = "closer-agenda-night-slots";
function loadNightPrefs(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(NIGHT_KEY) || "{}") ?? {};
  } catch {
    return {};
  }
}


function snapToSlot(d: Date) {
  const m = d.getMinutes() < 30 ? 0 : 30;
  return `${pad(d.getHours())}:${pad(m)}`;
}

/* ---------------- Card da reunião ---------------- */

function MeetingCard({
  m,
  consultant,
  showDate,
  draggable,
  compact,
}: {
  m: MeetingItem;
  consultant?: string;
  showDate?: boolean;
  draggable?: boolean;
  compact?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: m.leadId,
    disabled: !draggable,
    data: { meeting: m },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group flex items-stretch gap-2 rounded-xl border border-border bg-card shadow-sm transition-all hover:border-primary/40 hover:shadow-md",
        isDragging && "opacity-40",
      )}
    >
      {draggable && (
        <button
          type="button"
          {...listeners}
          {...attributes}
          aria-label="Arrastar reunião"
          className="flex w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-l-xl border-r border-border/60 bg-muted/40 text-muted-foreground hover:bg-primary/10 hover:text-primary active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <Link to={`/leads?lead=${m.leadId}`} className="min-w-0 flex-1 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="shrink-0 rounded-lg bg-primary px-2.5 py-1 text-sm font-extrabold tabular-nums leading-none text-primary-foreground">
            {hhmm(m.at)}
          </span>
          {showDate && (
            <span className="shrink-0 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
              {m.at.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-bold">{m.leadName}</span>
        </div>
        {consultant && (
          <span className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            <User2 className="h-3 w-3" /> {consultant}
          </span>
        )}
        {!compact && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", statusStyle[m.status])}>
              {statusLabel[m.status]}
            </span>
            {m.isRescheduled && (
              <span className="inline-flex items-center gap-1 rounded-full border border-info/30 bg-info/10 px-2 py-0.5 text-[10px] font-semibold text-info">
                <RotateCcw className="h-3 w-3" /> Reagendada
              </span>
            )}
            {m.value && (
              <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/5 px-2 py-0.5 text-[10px] font-semibold text-success">
                <BadgeDollarSign className="h-3 w-3" />
                {money(m.value)}
                {m.valueSource === "auto" && <span className="opacity-70">auto</span>}
              </span>
            )}
          </div>
        )}
      </Link>
    </div>
  );
}

/* ---------------- Célula (slot) ---------------- */

function SlotCell({
  closerId,
  slot,
  items,
  consultantName,
  disabled,
  closedSlot,
  onPickFree,
}: {
  closerId: string;
  slot: string;
  items: MeetingItem[];
  consultantName: (id: string | null) => string | undefined;
  disabled?: boolean;
  closedSlot?: boolean;
  onPickFree?: (closerId: string, slot: string) => void;
}) {
  const closed = !!closedSlot;
  const blocked = closed && items.length === 0;
  const { setNodeRef, isOver } = useDroppable({ id: `${closerId}__${slot}`, disabled: disabled || closed });
  const free = items.length === 0;

  if (blocked) {
    return (
      <div
        aria-disabled
        title="Horário indisponível no momento"
        className="flex min-h-[44px] cursor-not-allowed select-none items-center justify-center rounded-xl border border-dashed border-border/40 bg-muted/10 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/50"
      >
        Indisponível
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[44px] rounded-xl border p-1 transition-colors",
        free ? "border-dashed border-border/70 bg-muted/20" : "border-transparent",
        isOver && !closed && "border-primary bg-primary/10 ring-2 ring-primary/30",
        closed && "opacity-70",
      )}
    >
      {free ? (
        <button
          type="button"
          disabled={closed}
          onClick={() => !closed && onPickFree?.(closerId, slot)}
          className="flex h-full min-h-[36px] w-full items-center justify-center gap-1 rounded-lg text-[11px] font-semibold text-muted-foreground/70 transition-colors hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground/50"
        >
          <Plus className="h-3 w-3" /> Livre
        </button>
      ) : (
        <div className="space-y-1.5">
          {closed && (
            <p className="px-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70">
              Indisponível
            </p>
          )}
          {items.map((m) => (
            <MeetingCard
              key={m.leadId}
              m={m}
              consultant={consultantName(m.consultantMemberId)}
              draggable={!disabled && !closed}
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
}




/* ---------------- Componente principal ---------------- */

export function CloserAgenda({
  scope,
  defaultPeriod,
}: {
  scope?: { tenantId?: string | null; memberId?: string | null };
  defaultPeriod?: Period;
}) {
  const [period, setPeriod] = useState<Period>(defaultPeriod ?? "today");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [closerFilter, setCloserFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [dragging, setDragging] = useState<MeetingItem | null>(null);
  const [picker, setPicker] = useState<{ closerId: string; slot: string } | null>(null);
  const { member: activeMember } = useActiveMember();
  const canToggleNight = (closerId: string) => activeMember?.id === closerId;
  const [nightOpen, setNightOpen] = useState<Record<string, boolean>>(() => loadNightPrefs());
  const toggleNight = (id: string) => {
    if (!canToggleNight(id)) return;
    setNightOpen((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(NIGHT_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };


  const [pickerSearch, setPickerSearch] = useState("");
  const isMobile = useIsMobile();
  const [activeCloser, setActiveCloser] = useState<string>(CLOSERS[0]?.id ?? "");

  const { start, end } = useMemo(() => rangeOf(period), [period]);
  const { meetings, isLoading } = useCloserMeetings(start, end, scope);
  const { data: members = [] } = useTenantMembers();
  const { data: allLeads = [] } = useLeads({ kind: "all", ...(scope ?? {}) });
  const updateLead = useUpdateLead();
  const memberName = (id: string | null) => members.find((m: any) => m.id === id)?.display_name ?? undefined;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

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
  const isDayView = period === "today" || period === "tomorrow";
  const showDate = !isDayView;
  const anyNight = CLOSERS.some((c) => nightOpen[c.id]);
  const slots = useMemo(() => {
    const base = new Set(daySlots());
    if (anyNight) for (const s of nightSlots()) base.add(s);
    for (const m of filtered) base.add(snapToSlot(m.at));
    return Array.from(base).sort();
  }, [filtered, anyNight]);

  const dayDate = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    if (period === "tomorrow") d.setDate(d.getDate() + 1);
    return d;
  }, [period]);

  /** Move a reunião para outro closer e/ou horário. */
  async function moveMeeting(m: MeetingItem, closerId: string, slot: string) {
    const closer = CLOSERS.find((c) => c.id === closerId);
    if (!closer) return;
    const [h, min] = slot.split(":").map(Number);
    const target = new Date(dayDate);
    target.setHours(h, min, 0, 0);

    const sameCloser = m.closerId === closerId;
    const sameTime = hhmm(m.at) === slot && dateKey(m.at) === dateKey(target);
    if (sameCloser && sameTime) return;

    const iso = `${dateKey(target)}T${pad(h)}:${pad(min)}:00`;
    const meta: Record<string, any> = { ...(m.meta ?? {}) };
    if (m.isRescheduled) {
      meta.meeting_rescheduled_to = dateKey(target);
      meta.meeting_rescheduled_time = slot;
      meta.meeting_rescheduled_closer_id = closerId;
      meta.meeting_rescheduled_closer_name = closer.name;
    }
    meta.meeting_scheduled_at = iso;
    meta.meeting_closer_id = closerId;
    meta.meeting_closer_name = closer.name;

    try {
      await updateLead.mutateAsync({ id: m.leadId, patch: { metadata: meta } });
      toast.success(`${m.leadName} → ${closer.name} às ${slot}`);
    } catch (e: any) {
      toast.error("Não foi possível mover a reunião", { description: e?.message });
    }
  }

  function onDragStart(e: DragStartEvent) {
    setDragging((e.active.data.current as any)?.meeting ?? null);
  }
  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const over = e.over?.id;
    const m = (e.active.data.current as any)?.meeting as MeetingItem | undefined;
    if (!over || !m) return;
    const [closerId, slot] = String(over).split("__");
    if (!closerId || !slot) return;
    void moveMeeting(m, closerId, slot);
  }

  /** Agenda um lead existente no horário/closer escolhido. */
  async function scheduleLeadAt(lead: any, closerId: string, slot: string) {
    const closer = CLOSERS.find((c) => c.id === closerId);
    if (!closer) return;
    const [h, min] = slot.split(":").map(Number);
    const target = new Date(dayDate);
    target.setHours(h, min, 0, 0);
    const meta: Record<string, any> = { ...((lead.metadata ?? {}) as Record<string, any>) };
    meta.meeting_scheduled_at = `${dateKey(target)}T${pad(h)}:${pad(min)}:00`;
    meta.meeting_closer_id = closerId;
    meta.meeting_closer_name = closer.name;
    delete meta.meeting_rescheduled;
    delete meta.meeting_rescheduled_to;
    try {
      await updateLead.mutateAsync({ id: lead.id, patch: { metadata: meta } });
      toast.success(`${lead.name || lead.phone} agendado com ${closer.name} às ${slot}`);
      setPicker(null);
      setPickerSearch("");
    } catch (e: any) {
      toast.error("Não foi possível agendar", { description: e?.message });
    }
  }

  const pickerLeads = useMemo(() => {
    if (!picker) return [];
    const q = pickerSearch.trim().toLowerCase();
    const scheduled = new Set(filtered.map((m) => m.leadId));
    return (allLeads as any[])
      .filter((l) => !scheduled.has(l.id))
      .filter((l) => !q || `${l.name ?? ""} ${l.phone ?? ""}`.toLowerCase().includes(q))
      .slice(0, 40);
  }, [picker, pickerSearch, allLeads, filtered]);

  const visibleClosers = isMobile ? CLOSERS.filter((c) => c.id === activeCloser) : CLOSERS;
  const gridCols = isMobile ? "grid-cols-[48px_1fr]" : "grid-cols-[56px_1fr_1fr]";

  return (
    <section className="rounded-2xl border bg-card p-3 md:p-5">
      <header className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-foreground">
          <CalendarClock className="h-4 w-4 text-primary" />
          Agenda · por closer
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end sm:gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-bold text-success">
            <BadgeDollarSign className="h-3.5 w-3.5 shrink-0" />
            <span>Valor em pauta</span>
            <span className="tabular-nums">{money(totalValue) ?? "R$ 0"}</span>
          </span>
          <Link to="/agenda" className="shrink-0 text-xs font-semibold text-primary hover:underline">
            Ver agenda completa
          </Link>
        </div>
      </header>

      {/* Filtros */}
      <div className="mb-3 space-y-2 rounded-xl border bg-muted/20 p-2">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
              className="h-7 shrink-0 rounded-full px-3 text-xs"
              onClick={() => setPeriod(o.v)}
            >
              {o.l}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 min-w-0 flex-1 text-xs sm:w-[150px] sm:flex-none"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.keys(statusLabel).map((k) => (
                <SelectItem key={k} value={k}>{statusLabel[k as MeetingItem["status"]]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={closerFilter} onValueChange={setCloserFilter}>
            <SelectTrigger className="h-8 min-w-0 flex-1 text-xs sm:w-[150px] sm:flex-none"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os closers</SelectItem>
              {CLOSERS.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              <SelectItem value="none">Sem closer</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative w-full min-w-[160px] sm:ml-auto sm:w-auto sm:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar lead…"
              className="h-8 rounded-full pl-8 text-xs"
            />
          </div>
        </div>
      </div>


      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        {/* Seletor de closer (mobile) */}
        {isMobile && (
          <div className="mb-2 grid grid-cols-2 gap-1.5 rounded-xl bg-muted/40 p-1">
            {CLOSERS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCloser(c.id)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold transition-colors",
                  activeCloser === c.id ? "bg-card shadow-sm" : "text-muted-foreground",
                )}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Cabeçalho dos closers */}
        <div className={cn("grid gap-2", gridCols)}>
          <div />
          {visibleClosers.map((c) => {
            const items = byCloser.map.get(c.id) ?? [];
            const closed = items.filter((m) => m.status === "fechou").length;
            const rate = items.length ? Math.round((closed / items.length) * 100) : 0;
            return (
              <div key={c.id} className="min-w-0 rounded-xl border border-border bg-card px-2.5 py-2 shadow-sm md:px-3 md:py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 text-sm font-bold">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white md:h-7 md:w-7" style={{ background: c.color }}>
                      {c.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="truncate uppercase tracking-wide">{c.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">{items.length}</span>
                    <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-bold text-success">{rate}%</span>
                  </span>
                </div>
                <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Conversão · {closed}/{items.length} fechados
                </p>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-success transition-all" style={{ width: `${rate}%` }} />
                </div>
                {isDayView && (
                  <button
                    type="button"
                    disabled={!canToggleNight(c.id)}
                    title={canToggleNight(c.id) ? undefined : `Somente ${c.name} pode alterar este horário`}
                    onClick={() => toggleNight(c.id)}
                    aria-pressed={!!nightOpen[c.id]}
                    className={cn(
                      "mt-2 flex w-full items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors",
                      nightOpen[c.id]
                        ? "border-success/40 bg-success/10 text-success"
                        : "border-border bg-muted/30 text-muted-foreground",
                      canToggleNight(c.id)
                        ? !nightOpen[c.id] && "hover:bg-muted/60"
                        : "cursor-not-allowed opacity-70",
                    )}
                  >
                    <span className="flex items-center gap-1">
                      <Moon className="h-3 w-3" /> 18h–21h
                    </span>
                    <span className={cn(
                      "flex h-4 w-8 shrink-0 items-center rounded-full p-0.5 transition-colors",
                      nightOpen[c.id] ? "bg-success" : "bg-muted-foreground/30",
                    )}>
                      <span className={cn(
                        "h-3 w-3 rounded-full bg-white transition-transform",
                        nightOpen[c.id] && "translate-x-4",
                      )} />
                    </span>
                  </button>
                )}

              </div>
            );
          })}
        </div>

        {isDayView ? (
          <div className="mt-2 space-y-1.5">
            {slots.map((slot) => {
              const isHour = slot.endsWith(":00");
              return (
                <div key={slot} className={cn("grid items-stretch gap-2", gridCols)}>
                  <div className={cn(
                    "flex items-center justify-center rounded-lg border text-[11px] font-extrabold tabular-nums md:text-xs",
                    isHour ? "border-border bg-muted/50 text-foreground" : "border-transparent bg-transparent text-muted-foreground/70",
                  )}>
                    {slot}
                  </div>
                  {visibleClosers.map((c) => {
                    const items = (byCloser.map.get(c.id) ?? []).filter((m) => snapToSlot(m.at) === slot);
                    return (
                      <SlotCell
                        key={c.id + slot}
                        closerId={c.id}
                        slot={slot}
                        items={items}
                        consultantName={memberName}
                        closedSlot={isNightSlot(slot) && !nightOpen[c.id]}
                        onPickFree={(closerId, s) => setPicker({ closerId, slot: s })}
                      />
                    );
                  })}

                </div>
              );
            })}
            <p className="pt-1 text-center text-[11px] text-muted-foreground">
              Toque em <span className="font-semibold">Livre</span> para encaixar um lead, ou arraste pelo ícone <GripVertical className="inline h-3 w-3" /> para mudar horário/closer.
            </p>
          </div>
        ) : (
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {CLOSERS.map((c) => {
              const items = byCloser.map.get(c.id) ?? [];
              return (
                <div key={c.id} className="space-y-2 rounded-xl border border-border/70 bg-muted/10 p-3">
                  {items.length === 0 && (
                    <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                      {isLoading ? "Carregando…" : "Nenhuma reunião neste filtro"}
                    </p>
                  )}
                  {items.map((m) => (
                    <MeetingCard key={m.leadId + m.at.toISOString()} m={m} consultant={memberName(m.consultantMemberId)} showDate={showDate} />
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {byCloser.unassigned.length > 0 && (
          <div className="mt-3 rounded-xl border border-dashed p-3">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <User2 className="h-3.5 w-3.5" /> Sem closer definido ({byCloser.unassigned.length})
            </p>
            <div className="space-y-2">
                {byCloser.unassigned.map((m) => (
                  <MeetingCard key={m.leadId + m.at.toISOString()} m={m} consultant={memberName(m.consultantMemberId)} showDate={showDate} draggable />
                ))}
            </div>
          </div>
        )}


        <DragOverlay dropAnimation={null}>
          {dragging ? (
            <div className="rounded-xl border border-primary bg-card px-3 py-2 text-sm font-bold shadow-lg">
              <span className="mr-2 rounded-md bg-primary px-2 py-0.5 text-primary-foreground">{hhmm(dragging.at)}</span>
              {dragging.leadName}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {!isLoading && filtered.length === 0 && !isDayView && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          As reuniões aparecem aqui assim que o consultor marcar “Reunião agendada” nos status do lead.
        </p>
      )}

      {/* Escolher lead para o horário livre */}
      <Dialog open={!!picker} onOpenChange={(o) => { if (!o) { setPicker(null); setPickerSearch(""); } }}>
        <DialogContent className="max-h-[85vh] w-[95vw] max-w-md overflow-hidden p-4">
          <DialogHeader>
            <DialogTitle className="text-base">
              Encaixar lead às {picker?.slot}
              {picker && (
                <span className="ml-1 text-sm font-semibold text-muted-foreground">
                  · {CLOSERS.find((c) => c.id === picker.closerId)?.name}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              placeholder="Buscar por nome ou telefone…"
              className="h-9 rounded-full pl-8 text-sm"
            />
          </div>
          <div className="max-h-[55vh] space-y-1.5 overflow-y-auto pr-1">
            {pickerLeads.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">Nenhum lead encontrado.</p>
            )}
            {pickerLeads.map((l: any) => (
              <button
                key={l.id}
                type="button"
                disabled={updateLead.isPending}
                onClick={() => picker && scheduleLeadAt(l, picker.closerId, picker.slot)}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{l.name || l.phone || "Lead"}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {l.phone ?? "—"} · {memberName(l.assigned_member_id) ?? "Sem consultor"}
                  </span>
                </span>
                <Plus className="h-4 w-4 shrink-0 text-primary" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
