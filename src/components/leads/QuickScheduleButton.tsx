import { useState, type MouseEvent } from "react";
import { CalendarPlus, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useCreateAppointment, useTenantMembers } from "@/hooks/useData";
import { useGoogleIntegration, useSyncAppointmentToGoogle, MEETING_TYPES } from "@/hooks/useMeetings";
import { toast } from "@/hooks/use-toast";

function defaultDate() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

export function QuickScheduleButton({ leadId, leadName }: { leadId: string; leadName?: string | null }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => defaultDate().toISOString().slice(0, 10));
  const [time, setTime] = useState(() => defaultDate().toTimeString().slice(0, 5));
  const [duration, setDuration] = useState(30);
  const [meetingType, setMeetingType] = useState("simulacao");
  const [consultantId, setConsultantId] = useState("");
  const [notes, setNotes] = useState("");
  const [createMeet, setCreateMeet] = useState(true);

  const { data: members = [] } = useTenantMembers();
  const { data: googleIntegration } = useGoogleIntegration();
  const create = useCreateAppointment();
  const sync = useSyncAppointmentToGoogle();

  const stop = (e: MouseEvent) => e.stopPropagation();

  async function submit() {
    try {
      const when = new Date(`${date}T${time}:00`);
      const typeInfo = MEETING_TYPES.find((t) => t.value === meetingType);
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

      if (googleIntegration?.is_connected && created?.id) {
        try {
          const r = await sync.mutateAsync({ appointment_id: created.id, create_meet: createMeet });
          toast({
            title: "Reunião agendada",
            description: r?.meet_link ? "Evento + link do Meet criados." : "Adicionada ao Google Calendar.",
          });
        } catch (e: any) {
          toast({ title: "Agendada — falha ao sincronizar", description: e.message, variant: "destructive" });
        }
      } else {
        toast({ title: "Reunião agendada", description: "Conecte o Google Calendar para gerar o link do Meet." });
      }
      setOpen(false); setNotes("");
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          onClick={stop}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          title="Agendar reunião"
        >
          <CalendarPlus className="h-3 w-3" /> Agendar
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md" onClick={stop}>
        <DialogHeader>
          <DialogTitle>Agendar reunião{leadName ? ` — ${leadName}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Data</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Horário</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Duração (min)</Label>
              <Input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <select value={meetingType} onChange={(e) => setMeetingType(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                {MEETING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Consultor</Label>
            <select value={consultantId} onChange={(e) => setConsultantId(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">Sem atribuição</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Pauta…" />
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-2.5 text-xs">
            <input type="checkbox" checked={createMeet} onChange={(e) => setCreateMeet(e.target.checked)} className="h-4 w-4 accent-primary" />
            <Video className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex-1">Criar link do Google Meet automaticamente</span>
            {!googleIntegration?.is_connected && (
              <Badge variant="outline" className="text-[10px]">requer Google</Badge>
            )}
          </label>
          <Button onClick={submit} disabled={create.isPending || sync.isPending} className="w-full">
            {create.isPending || sync.isPending ? "Salvando…" : "Agendar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
