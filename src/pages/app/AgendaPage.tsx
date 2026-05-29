import { useState } from "react";
import { PageHeader } from "./PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import { useAppointments, useUpdateAppointment, useCreateAppointment, useLeads, useTenantMembers } from "@/hooks/useData";
import { useGoogleIntegration, MEETING_TYPES, MEETING_OUTCOMES, useVerifyGoogleConnection, useSyncAppointmentToGoogle } from "@/hooks/useMeetings";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Video, ExternalLink, Calendar as CalendarIcon, AlertCircle,
  Sparkles, Users as UsersIcon, Phone, FileSignature, HeartHandshake, TrendingUp, MessageCircle,
} from "lucide-react";
import { Link } from "react-router-dom";

const dayShort = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const monthNames = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

const typeIcons: Record<string, typeof Video> = {
  simulacao: TrendingUp,
  proposta: FileSignature,
  objecoes: MessageCircle,
  assinatura: FileSignature,
  pos_venda: HeartHandshake,
  treinamento: UsersIcon,
};

function weekStrip(reference: Date) {
  const d = new Date(reference);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(monday); x.setDate(monday.getDate() + i); return x; });
}

function monthGrid(reference: Date) {
  const first = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const day = first.getDay();
  const start = new Date(first);
  start.setDate(first.getDate() - ((day + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => { const x = new Date(start); x.setDate(start.getDate() + i); return x; });
}

const statusBadge: Record<string, string> = {
  scheduled: "bg-warning/10 text-warning border-warning/30",
  agendado: "bg-warning/10 text-warning border-warning/30",
  confirmado: "bg-info/10 text-info border-info/30",
  compareceu: "bg-success/10 text-success border-success/30",
  realizado: "bg-success/10 text-success border-success/30",
  faltou: "bg-destructive/10 text-destructive border-destructive/20",
  cancelado: "bg-muted text-muted-foreground border-border",
};

const typeColorMap: Record<string, string> = {
  simulacao: "bg-info/10 text-info border-info/20",
  proposta: "bg-warning/10 text-warning border-warning/20",
  objecoes: "bg-destructive/10 text-destructive border-destructive/20",
  assinatura: "bg-success/10 text-success border-success/20",
  pos_venda: "bg-stage-attended/10 text-stage-attended border-stage-attended/20",
  treinamento: "bg-primary/10 text-primary border-primary/20",
};

export default function AgendaPage() {
  const [selected, setSelected] = useState(new Date());
  const [view, setView] = useState<"week" | "month">("week");
  const days = weekStrip(selected);
  const todayIso = new Date().toDateString();
  const selectedIso = selected.toDateString();

  const dayStart = new Date(selected); dayStart.setHours(0,0,0,0);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate()+1);
  const { data: items = [], isLoading } = useAppointments(dayStart, dayEnd);

  const monthStart = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const monthEnd = new Date(selected.getFullYear(), selected.getMonth() + 1, 1);
  const { data: monthItems = [] } = useAppointments(monthStart, monthEnd);
  const countsByDay = monthItems.reduce<Record<string, number>>((acc, a: any) => {
    const k = new Date(a.scheduled_at).toDateString();
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  const update = useUpdateAppointment();
  const create = useCreateAppointment();
  const { data: leads = [] } = useLeads();
  const { data: members = [] } = useTenantMembers();
  const { data: googleIntegration } = useGoogleIntegration();
  const verifyGoogle = useVerifyGoogleConnection();
  const syncGoogle = useSyncAppointmentToGoogle();

  const [open, setOpen] = useState(false);
  const [leadId, setLeadId] = useState("");
  const [consultantId, setConsultantId] = useState("");
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState(30);
  const [meetingType, setMeetingType] = useState<string>("simulacao");
  const [notes, setNotes] = useState("");
  const [createMeet, setCreateMeet] = useState(true);

  async function submit() {
    const [h, m] = time.split(":").map(Number);
    const when = new Date(selected); when.setHours(h, m, 0, 0);
    const typeInfo = MEETING_TYPES.find((t) => t.value === meetingType);
    try {
      const created = await create.mutateAsync({
        lead_id: leadId,
        scheduled_at: when.toISOString(),
        duration_minutes: duration,
        type: meetingType,
        meeting_type: meetingType,
        title: typeInfo?.label ?? "Reunião",
        description: notes || null,
        consultant_member_id: consultantId || null,
        google_sync_status: googleIntegration?.is_connected ? "pending" : "not_connected",
        meet_link: createMeet && googleIntegration?.is_connected ? "pending" : null,
      } as any);
      setOpen(false); setLeadId(""); setConsultantId(""); setTime("09:00"); setNotes(""); setMeetingType("simulacao");

      if (googleIntegration?.is_connected && created?.id) {
        try {
          const res = await syncGoogle.mutateAsync({ appointment_id: created.id, create_meet: createMeet });
          toast({
            title: "Reunião agendada e sincronizada",
            description: res?.meet_link ? `Link do Meet criado.` : "Evento adicionado ao Google Calendar.",
          });
        } catch (err: any) {
          toast({ title: "Agendada — falha ao sincronizar", description: err.message, variant: "destructive" });
        }
      } else {
        toast({
          title: "Reunião agendada",
          description: "Salva localmente. Conecte o Google Calendar para criar o evento e o link do Meet.",
        });
      }
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  }

  function shiftWeek(delta: number) {
    const d = new Date(selected); d.setDate(d.getDate() + delta * 7); setSelected(d);
  }
  function shiftMonth(delta: number) {
    const d = new Date(selected); d.setMonth(d.getMonth() + delta); setSelected(d);
  }

  const todayMeetings = items.length;
  const withMeetLink = items.filter((a: any) => a.meet_link).length;

  return (
    <>
      <PageHeader
        title="Agenda"
        subtitle={view === "week" ? "Reuniões da semana com seus leads de consórcio" : "Visão mensal das reuniões"}
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
              <Link to="/gravacoes"><Video className="mr-1.5 h-4 w-4" /> Gravações</Link>
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button>+ Nova reunião</Button></DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Nova reunião — {selected.toLocaleDateString("pt-BR")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Lead / Cliente</Label>
                    <select value={leadId} onChange={(e) => setLeadId(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                      <option value="">Selecione…</option>
                      {leads.map((l) => <option key={l.id} value={l.id}>{l.name ?? l.phone}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Consultor responsável</Label>
                    <select value={consultantId} onChange={(e) => setConsultantId(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                      <option value="">Sem atribuição</option>
                      {members.map((m) => <option key={m.id} value={m.id}>{m.display_name}{m.role_label ? ` · ${m.role_label}` : ""}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tipo da reunião</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {MEETING_TYPES.map((t) => {
                        const Icon = typeIcons[t.value] ?? Video;
                        const active = meetingType === t.value;
                        return (
                          <button
                            type="button"
                            key={t.value}
                            onClick={() => setMeetingType(t.value)}
                            className={cn(
                              "flex items-start gap-2 rounded-lg border p-2.5 text-left text-xs transition-all",
                              active
                                ? "border-primary bg-primary/5 ring-1 ring-primary"
                                : "border-border hover:border-primary/40 hover:bg-muted"
                            )}
                          >
                            <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                            <div className="min-w-0">
                              <div className="font-semibold">{t.label}</div>
                              <div className="truncate text-[10px] text-muted-foreground">{t.description}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Horário</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
                    <div className="space-y-1.5"><Label>Duração (min)</Label><Input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Pauta / observações</Label>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: revisar simulação de R$ 80mil, alinhar lance livre…" rows={2} />
                  </div>
                  <label className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-2.5 text-xs">
                    <input type="checkbox" checked={createMeet} onChange={(e) => setCreateMeet(e.target.checked)} className="h-4 w-4 accent-primary" />
                    <Video className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="flex-1">Criar link do Google Meet automaticamente</span>
                    {!googleIntegration?.is_connected && (
                      <Badge variant="outline" className="text-[10px]">requer Google</Badge>
                    )}
                  </label>
                  <Button onClick={submit} disabled={!leadId || create.isPending} className="w-full">
                    {create.isPending ? "Salvando…" : "Agendar reunião"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div className="space-y-4 p-4 md:p-8">
        {/* Google integration banner */}
        {!googleIntegration?.is_connected && (
          <div className="flex flex-col gap-3 rounded-2xl border border-info/30 bg-gradient-to-r from-info/5 via-primary/5 to-success/5 p-4 sm:flex-row sm:items-center">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-info/10 text-info">
              <CalendarIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-semibold">
                Conecte o Google Calendar + Meet
                <Badge variant="outline" className="border-warning/30 bg-warning/10 text-[10px] text-warning">aguardando configuração</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                Tudo já está preparado: ao conectar, suas reuniões viram eventos no calendário, ganham link do Meet e as gravações entram automaticamente na biblioteca de <Link to="/gravacoes" className="underline">Gravações</Link>.
              </div>
            </div>
            <Button
              size="sm"
              onClick={async () => {
                try {
                  const r = await verifyGoogle.mutateAsync();
                  toast({ title: "Google Calendar conectado", description: r?.email ? `Conta: ${r.email}` : "Pronto para sincronizar." });
                } catch (e: any) {
                  toast({ title: "Falha ao conectar", description: e.message, variant: "destructive" });
                }
              }}
              disabled={verifyGoogle.isPending}
            >
              {verifyGoogle.isPending ? "Conectando…" : "Conectar Google Calendar"}
            </Button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard to="/agenda" icon={CalendarIcon} label="Hoje" value={todayMeetings} hint="reuniões" tone="primary" />
          <StatCard to="/agenda?filter=meet" icon={Video} label="Com Meet" value={withMeetLink} hint="link gerado" tone="info" />
          <StatCard to="/agenda?range=month" icon={Sparkles} label="No mês" value={monthItems.length} hint="agendadas" tone="success" />
          <StatCard to="/consultores" icon={UsersIcon} label="Consultores" value={members.length} hint="ativos" tone="warning" />
        </div>

        {/* Calendar nav */}
        <div className="client-card rounded-2xl p-3">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-1">
              <button onClick={() => view === "week" ? shiftWeek(-1) : shiftMonth(-1)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label="Anterior">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button onClick={() => setSelected(new Date())} className="rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted">Hoje</button>
              <button onClick={() => view === "week" ? shiftWeek(1) : shiftMonth(1)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label="Próximo">
                <ChevronRight className="h-4 w-4" />
              </button>
              <span className="ml-2 text-sm font-semibold capitalize text-foreground">
                {monthNames[selected.getMonth()]} {selected.getFullYear()}
              </span>
            </div>
            <button onClick={() => setView(view === "week" ? "month" : "week")} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted">
              {view === "week" ? (<><ChevronDown className="h-3.5 w-3.5" /> Ver mês</>) : (<><ChevronUp className="h-3.5 w-3.5" /> Ver semana</>)}
            </button>
          </div>

          {view === "week" ? (
            <div className="flex gap-2 overflow-x-auto">
              {days.map((d) => {
                const isSelected = d.toDateString() === selectedIso;
                const isToday = d.toDateString() === todayIso;
                const count = countsByDay[d.toDateString()] ?? 0;
                return (
                  <button key={d.toISOString()} onClick={() => setSelected(d)}
                    className={cn("relative flex min-w-[64px] flex-1 flex-col items-center rounded-xl px-3 py-2.5 text-sm transition-all",
                      isSelected ? "bg-primary text-primary-foreground shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.5)]" : "hover:bg-muted")}>
                    <span className={cn("text-[11px] uppercase tracking-wide", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>{dayShort[d.getDay()]}</span>
                    <span className={cn("font-display text-lg font-bold", isToday && !isSelected && "text-primary")}>{d.getDate()}</span>
                    {count > 0 && (
                      <span className={cn("mt-0.5 h-1.5 w-1.5 rounded-full", isSelected ? "bg-primary-foreground" : "bg-primary")} />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-7 gap-1 px-1 pb-1.5">
                {["seg","ter","qua","qui","sex","sáb","dom"].map((d) => (
                  <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthGrid(selected).map((d) => {
                  const inMonth = d.getMonth() === selected.getMonth();
                  const isSelected = d.toDateString() === selectedIso;
                  const isToday = d.toDateString() === todayIso;
                  const count = countsByDay[d.toDateString()] ?? 0;
                  return (
                    <button key={d.toISOString()} onClick={() => setSelected(d)}
                      className={cn("flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition-all",
                        isSelected ? "bg-primary text-primary-foreground shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.5)]" : "hover:bg-muted",
                        !inMonth && !isSelected && "text-muted-foreground/40")}>
                      <span className={cn("font-display text-base font-semibold", isToday && !isSelected && "text-primary")}>{d.getDate()}</span>
                      {count > 0 && (
                        <span className={cn("mt-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold",
                          isSelected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/10 text-primary")}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Day list */}
        <div className="client-card rounded-2xl">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
            <h2 className="font-display text-base font-semibold tracking-tight capitalize">
              {selected.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
            </h2>
            <span className="text-xs text-muted-foreground">{items.length} reunião(ões)</span>
          </div>
          {isLoading && <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>}
          {!isLoading && items.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <CalendarIcon className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">Nenhuma reunião nesse dia</p>
              <p className="text-xs text-muted-foreground">Agende uma simulação, proposta ou assinatura com seus leads.</p>
            </div>
          )}
          {!isLoading && items.length > 0 && (
            <ul className="divide-y divide-border/60">
              {items.map((a: any) => {
                const typeInfo = MEETING_TYPES.find((t) => t.value === (a.meeting_type ?? a.type)) ?? MEETING_TYPES[0];
                const Icon = typeIcons[typeInfo.value] ?? Video;
                const consultant = members.find((m) => m.id === a.consultant_member_id);
                return (
                  <li key={a.id} className="flex flex-wrap items-start gap-4 p-4 md:items-center">
                    <div className="flex flex-col items-center">
                      <div className="font-display text-2xl font-bold tabular-nums text-primary">{formatTime(a.scheduled_at)}</div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{a.duration_minutes}min</div>
                    </div>
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", typeColorMap[typeInfo.value])}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{a.lead?.name ?? a.lead?.phone ?? "—"}</span>
                        <Badge variant="outline" className={cn("text-[10px]", typeColorMap[typeInfo.value])}>{typeInfo.label}</Badge>
                        {a.meet_link && a.meet_link !== "pending" && (
                          <Badge variant="outline" className="border-success/30 bg-success/10 text-[10px] text-success">
                            <Video className="mr-1 h-2.5 w-2.5" /> Meet pronto
                          </Badge>
                        )}
                        {a.meet_link === "pending" && (
                          <Badge variant="outline" className="border-warning/30 bg-warning/10 text-[10px] text-warning">Meet aguardando sync</Badge>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {consultant && (
                          <span className="inline-flex items-center gap-1">
                            <span className="inline-block h-2 w-2 rounded-full" style={{ background: consultant.avatar_color ?? "#1E40AF" }} />
                            {consultant.display_name}
                          </span>
                        )}
                        {a.lead?.phone && (<><span>·</span><span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{a.lead.phone}</span></>)}
                        {a.description && (<><span>·</span><span className="truncate max-w-xs">{a.description}</span></>)}
                      </div>
                    </div>
                    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize", statusBadge[a.status] ?? "")}>{a.status}</span>
                    <div className="flex flex-wrap gap-2">
                      {a.meet_link && a.meet_link !== "pending" && (
                        <Button size="sm" variant="outline" asChild>
                          <a href={a.meet_link} target="_blank" rel="noreferrer"><Video className="mr-1 h-3.5 w-3.5" /> Entrar<ExternalLink className="ml-1 h-3 w-3" /></a>
                        </Button>
                      )}
                      {(a.status === "scheduled" || a.status === "agendado") && (
                        <Button size="sm" onClick={() => update.mutate({ id: a.id, patch: { status: "confirmado" } })}>Confirmar</Button>
                      )}
                      {a.status !== "compareceu" && a.status !== "realizado" && a.status !== "cancelado" && (
                        <Button size="sm" variant="outline" onClick={() => update.mutate({ id: a.id, patch: { status: "realizado" } })}>Realizado</Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Outcome legend */}
        <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <AlertCircle className="h-3 w-3" /> Resultados que você pode registrar pós-reunião
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MEETING_OUTCOMES.map((o) => (
              <Badge key={o.value} variant="outline" className={`bg-${o.color}/10 text-${o.color} border-${o.color}/20 text-[10px]`}>{o.label}</Badge>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function StatCard({ icon: Icon, label, value, hint, tone, to }: { icon: typeof Video; label: string; value: number; hint: string; tone: string; to?: string }) {
  const Wrapper: any = to ? Link : "div";
  const wrapperProps = to ? { to } : {};
  return (
    <Wrapper
      {...wrapperProps}
      className={`client-card rounded-xl p-3 ${to ? "block cursor-pointer transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" : ""}`}
    >
      <div className="flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-${tone}/10 text-${tone}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="font-display text-lg font-bold leading-none">{value}</div>
        </div>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">{hint}</div>
    </Wrapper>
  );
}
