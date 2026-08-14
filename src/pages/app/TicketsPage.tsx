import { useMemo, useState } from "react";
import { PageHeader } from "./PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LifeBuoy, Search, Send, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  TICKET_STATUS_CLASS,
  TICKET_STATUS_LABEL,
  TICKET_STATUS_ORDER,
  TICKET_PRIORITY_LABEL,
  type TicketStatus,
} from "@/lib/support";
import {
  useSupportTickets,
  useUpdateTicket,
  useTicketMessages,
  useSendTicketMessage,
  useSignedTicketImages,
  useIsSupportAccount,
  type SupportTicket,
} from "@/hooks/useSupportTickets";

export default function TicketsPage() {
  const { data: tickets = [], isLoading } = useSupportTickets();
  const isSupport = useIsSupportAccount();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SupportTicket | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter((t) =>
      [t.subject, t.description, t.requester_name, t.requester_email]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [tickets, search]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { todos: filtered.length };
    for (const s of TICKET_STATUS_ORDER) map[s] = filtered.filter((t) => t.status === s).length;
    return map;
  }, [filtered]);

  return (
    <>
      <PageHeader
        title="Tickets de suporte"
        subtitle={`${tickets.length} ${tickets.length === 1 ? "chamado" : "chamados"} · atendimento técnico Feracon`}
      />
      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por assunto, descrição ou pessoa..."
            className="pl-9"
          />
        </div>

        <Tabs defaultValue="novo">
          <TabsList className="flex w-full flex-wrap justify-start gap-1 overflow-x-auto">
            {(["todos", ...TICKET_STATUS_ORDER] as const).map((key) => (
              <TabsTrigger key={key} value={key} className="text-xs">
                {key === "todos" ? "Todos" : TICKET_STATUS_LABEL[key as TicketStatus]}
                <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[10px]">{counts[key] ?? 0}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {(["todos", ...TICKET_STATUS_ORDER] as const).map((key) => (
            <TabsContent key={key} value={key} className="mt-4 space-y-2">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)
              ) : (
                <TicketList
                  tickets={key === "todos" ? filtered : filtered.filter((t) => t.status === key)}
                  onOpen={setSelected}
                />
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <TicketDetailDialog ticket={selected} isSupport={isSupport} onClose={() => setSelected(null)} />
    </>
  );
}

function TicketList({ tickets, onOpen }: { tickets: SupportTicket[]; onOpen: (t: SupportTicket) => void }) {
  if (tickets.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Nenhum ticket nesta etapa.</p>;
  }
  return (
    <>
      {tickets.map((t) => (
        <button
          key={t.id}
          onClick={() => onOpen(t)}
          className="flex w-full items-start gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50"
        >
          <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{t.subject}</p>
            <p className="line-clamp-1 text-xs text-muted-foreground">{t.description}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t.requester_name ?? t.requester_email ?? "—"} ·{" "}
              {new Date(t.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
              {t.images.length > 0 && ` · ${t.images.length} print(s)`}
            </p>
          </div>
          <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium", TICKET_STATUS_CLASS[t.status] ?? "")}>
            {TICKET_STATUS_LABEL[t.status] ?? t.status}
          </span>
        </button>
      ))}
    </>
  );
}

function TicketDetailDialog({
  ticket,
  isSupport,
  onClose,
}: {
  ticket: SupportTicket | null;
  isSupport: boolean;
  onClose: () => void;
}) {
  const update = useUpdateTicket();
  const { data: messages = [] } = useTicketMessages(ticket?.id ?? null);
  const { data: images = [] } = useSignedTicketImages(ticket?.images ?? []);
  const send = useSendTicketMessage();
  const [reply, setReply] = useState("");

  if (!ticket) return null;

  async function changeStatus(status: TicketStatus) {
    try {
      await update.mutateAsync({ id: ticket!.id, status });
      toast.success(`Ticket movido para "${TICKET_STATUS_LABEL[status]}"`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao atualizar o ticket.");
    }
  }

  async function submitReply() {
    if (!reply.trim()) return;
    try {
      await send.mutateAsync({ ticketId: ticket!.id, body: reply.trim(), isSupport });
      setReply("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar a resposta.");
    }
  }

  return (
    <Dialog open={!!ticket} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{ticket.subject}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {ticket.requester_name ?? ticket.requester_email ?? "—"} ·{" "}
            {new Date(ticket.created_at).toLocaleString("pt-BR")}
          </p>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          <p className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">{ticket.description}</p>

          {images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {images.map((src, i) => (
                <a key={src} href={src} target="_blank" rel="noopener noreferrer">
                  <img src={src} alt={`Print ${i + 1} do ticket`} className="h-20 w-20 rounded-md border border-border object-cover" />
                </a>
              ))}
            </div>
          )}

          {isSupport && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Status</p>
                <Select value={ticket.status} onValueChange={(v) => changeStatus(v as TicketStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TICKET_STATUS_ORDER.map((s) => (
                      <SelectItem key={s} value={s}>{TICKET_STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Prioridade</p>
                <Select value={ticket.priority} onValueChange={(v) => update.mutate({ id: ticket.id, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TICKET_PRIORITY_LABEL).map(([v, label]) => (
                      <SelectItem key={v} value={v}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Conversa</p>
            {messages.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma resposta ainda.</p>}
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "rounded-lg border p-2 text-sm",
                  m.is_support ? "border-primary/30 bg-primary/5" : "border-border bg-card",
                )}
              >
                <p className="text-[11px] text-muted-foreground">
                  {m.is_support ? "Suporte" : m.author_name ?? "Usuário"} ·{" "}
                  {new Date(m.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </p>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-end gap-2 border-t border-border pt-3">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={2}
            placeholder="Escreva uma resposta..."
            className="flex-1"
          />
          <Button onClick={submitReply} disabled={send.isPending || !reply.trim()}>
            {send.isPending ? <Clock className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
