import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { LifeBuoy, MessageCircle, ImagePlus, X, Send, Clock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  SUPPORT_HOURS_LABEL,
  SUPPORT_LABEL,
  SUPPORT_NAME,
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_WHATSAPP_URL,
  isSupportOnline,
} from "@/lib/support";
import { useCreateTicket, useSupportTickets } from "@/hooks/useSupportTickets";
import { TICKET_STATUS_CLASS, TICKET_STATUS_LABEL, type TicketStatus } from "@/lib/support";

/**
 * Aba vertical discreta (estilo Zendesk) fixa na borda direita do CRM.
 * Abre o atendimento do Suporte técnico: WhatsApp direto ou abertura de
 * ticket com prints quando o suporte estiver fora do horário.
 */
export function SupportTab() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"home" | "ticket">("home");
  const online = useMemo(() => isSupportOnline(), [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => { setMode("home"); setOpen(true); }}
        aria-label="Abrir suporte técnico"
        className={cn(
          "group fixed right-0 top-1/2 z-40 hidden -translate-y-1/2 items-center gap-2 rounded-l-xl border border-r-0 border-black/10",
          "bg-[#0f766e] px-2 py-4 text-white shadow-lg transition-all hover:bg-[#0d9488] hover:px-3 md:flex",
        )}
        style={{ writingMode: "vertical-rl" }}
      >
        <LifeBuoy className="h-4 w-4 rotate-90" />
        <span className="text-xs font-semibold tracking-wide">Suporte</span>
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            online ? "bg-emerald-300" : "bg-amber-300",
          )}
        />
      </button>

      {/* Mobile: botão flutuante compacto */}
      <button
        type="button"
        onClick={() => { setMode("home"); setOpen(true); }}
        aria-label="Abrir suporte técnico"
        className="fixed bottom-20 right-3 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-[#0f766e] text-white shadow-lg md:hidden"
      >
        <LifeBuoy className="h-5 w-5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md p-0">
          <DialogHeader className="rounded-t-lg bg-[#0f766e] px-5 py-4 text-white">
            <DialogTitle className="flex items-center gap-2 text-base text-white">
              <LifeBuoy className="h-5 w-5" /> {SUPPORT_LABEL}
            </DialogTitle>
            <p className="text-xs text-white/80">
              {SUPPORT_NAME} · {SUPPORT_PHONE_DISPLAY}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-white/80">
              <span className={cn("h-2 w-2 rounded-full", online ? "bg-emerald-300" : "bg-amber-300")} />
              {online ? "Online agora" : `Offline · ${SUPPORT_HOURS_LABEL}`}
            </p>
          </DialogHeader>

          <div className="max-h-[70vh] overflow-y-auto px-5 pb-5">
            {mode === "home" ? (
              <SupportHome online={online} onTicket={() => setMode("ticket")} />
            ) : (
              <TicketForm onDone={() => { setMode("home"); setOpen(false); }} onBack={() => setMode("home")} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SupportHome({ online, onTicket }: { online: boolean; onTicket: () => void }) {
  const { data: tickets = [] } = useSupportTickets();
  const mine = tickets.slice(0, 3);

  return (
    <div className="space-y-4 pt-4">
      <p className="text-sm text-muted-foreground">
        Fale com o suporte pelo WhatsApp. Se estivermos offline, abra um ticket com o print
        do erro que respondemos assim que possível.
      </p>

      <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="block">
        <Button className="w-full bg-[#25D366] text-white hover:bg-[#1fb457]">
          <MessageCircle className="mr-2 h-4 w-4" /> Ir para o WhatsApp
        </Button>
      </a>

      <Button variant="outline" className="w-full" onClick={onTicket}>
        <ImagePlus className="mr-2 h-4 w-4" /> Abrir ticket com print
      </Button>

      {!online && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          O suporte está fora do horário de atendimento ({SUPPORT_HOURS_LABEL}). Abrir um ticket
          garante que seu problema entre na fila.
        </p>
      )}

      {mine.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-semibold text-muted-foreground">Meus últimos tickets</p>
          {mine.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2">
              <span className="min-w-0 flex-1 truncate text-xs">{t.subject}</span>
              <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium", TICKET_STATUS_CLASS[t.status as TicketStatus] ?? "")}>
                {TICKET_STATUS_LABEL[t.status as TicketStatus] ?? t.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TicketForm({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const create = useCreateTicket();

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = Array.from(list).filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...next].slice(0, 5));
  }

  async function submit() {
    if (!subject.trim() || !description.trim()) {
      toast.error("Preencha o assunto e a descrição do problema.");
      return;
    }
    try {
      await create.mutateAsync({ subject: subject.trim(), description: description.trim(), files });
      toast.success("Ticket enviado! O suporte já foi notificado.");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível abrir o ticket.");
    }
  }

  return (
    <div className="space-y-3 pt-4">
      <div className="space-y-1.5">
        <Label htmlFor="ticket-subject">Assunto</Label>
        <Input
          id="ticket-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Ex.: Não consigo conectar meu WhatsApp"
          maxLength={120}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ticket-desc">Descreva o problema</Label>
        <Textarea
          id="ticket-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="Conte o que aconteceu, em qual tela e o que você já tentou."
        />
      </div>

      <div className="space-y-2">
        <Label>Prints do erro (até 5)</Label>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <ImagePlus className="mr-2 h-4 w-4" /> Anexar imagem
        </Button>
        {previews.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {previews.map((src, i) => (
              <div key={src} className="relative">
                <img src={src} alt={`Print ${i + 1}`} className="h-16 w-16 rounded-md border border-border object-cover" />
                <button
                  type="button"
                  aria-label="Remover imagem"
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button variant="ghost" className="flex-1" onClick={onBack} disabled={create.isPending}>
          Voltar
        </Button>
        <Button className="flex-1" onClick={submit} disabled={create.isPending}>
          {create.isPending ? <Clock className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Enviar ticket
        </Button>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <CheckCircle2 className="h-3 w-3" /> Você acompanha o andamento aqui mesmo nesta aba.
      </p>
    </div>
  );
}
