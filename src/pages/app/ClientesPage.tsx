import { Link } from "react-router-dom";
import { PageHeader } from "./PageHeader";
import { TempBadge } from "@/components/oticaflow/TempBadge";
import { StageBadge } from "@/components/oticaflow/StageBadge";
import { InitialsAvatar } from "@/components/oticaflow/Avatar";
import { timeAgo } from "@/lib/format";
import { useLeads, useCreateLead } from "@/hooks/useData";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";

export default function ClientesPage() {
  const { can } = usePermissions();
  const viewAll = can("view_all_leads");
  const effectiveUser = useEffectiveUser();
  const { data: allLeads = [], isLoading } = useLeads(viewAll ? { kind: "all" } : undefined);
  // Consultor vê somente os clientes atribuídos a ele.
  const leads = useMemo(() => {
    if (viewAll) return allLeads;
    const mid = effectiveUser.memberId;
    const uid = effectiveUser.id;
    return allLeads.filter(
      (l) => (mid && l.assigned_member_id === mid) || (uid && l.assigned_to === uid),
    );
  }, [allLeads, viewAll, effectiveUser.memberId, effectiveUser.id]);
  const create = useCreateLead();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  async function submit() {
    try {
      await create.mutateAsync({ name: name || null, phone, email: email || null });
      toast({ title: "Cliente criado" });
      setOpen(false); setName(""); setPhone(""); setEmail("");
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  }

  return (
    <>
      <PageHeader title="Clientes" subtitle="Diretório completo de contatos" actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>+ Novo cliente</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo cliente</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Telefone (com DDD)</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="11999999999" /></div>
              <div className="space-y-1.5"><Label>E-mail (opcional)</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <Button onClick={submit} disabled={!phone || create.isPending} className="w-full">{create.isPending ? "Salvando…" : "Criar"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      } />
      <div className="p-3 md:p-8">
        {isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}
        {!isLoading && leads.length === 0 && (
          <div className="rounded-xl border bg-card p-12 text-center">
            <p className="text-sm text-muted-foreground">Nenhum cliente ainda. Eles aparecem aqui assim que escreverem no WhatsApp.</p>
          </div>
        )}
        {leads.length > 0 && (
          <>
            {/* Mobile: card list */}
            <ul className="space-y-2 md:hidden">
              {leads.map((l) => (
                <li key={l.id}>
                  <Link to={`/conversas?lead=${l.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/30">
                    <InitialsAvatar name={l.name ?? "?"} className="h-10 w-10 shrink-0 text-xs" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{l.name ?? "Sem nome"}</span>
                        <TempBadge temperature={l.temperature} />
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{l.phone}</div>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <StageBadge stage={l.stage} />
                        <span className="shrink-0 text-[11px] text-muted-foreground">{l.last_message_at ? timeAgo(l.last_message_at) : "—"}</span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {/* Desktop: table */}
            <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
              <table className="min-w-full text-sm">
              <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Estágio</th>
                  <th className="px-4 py-3 font-medium">Temperatura</th>
                  <th className="px-4 py-3 font-medium">Última conversa</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {leads.map((l) => (
                  <tr key={l.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <InitialsAvatar name={l.name ?? "?"} className="h-9 w-9 text-xs" />
                        <div>
                          <div className="font-semibold">{l.name ?? "Sem nome"}</div>
                          <div className="text-xs text-muted-foreground">{l.phone}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><StageBadge stage={l.stage} /></td>
                    <td className="px-4 py-3"><TempBadge temperature={l.temperature} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{l.last_message_at ? timeAgo(l.last_message_at) : "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/conversas?lead=${l.id}`} className="text-xs font-medium text-primary hover:underline">Abrir →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
