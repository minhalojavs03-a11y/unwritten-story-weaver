import { AdminHeader } from "./AdminHeader";
import { Switch } from "@/components/ui/switch";
import { useAutomations } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export default function AdminAutomacoes() {
  const { data: automations = [] } = useAutomations();
  const qc = useQueryClient();
  const { tenantId } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("no_response");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function toggle(id: string, active: boolean) {
    await supabase.from("automations").update({ active }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["automations"] });
  }

  async function create() {
    if (!tenantId) { toast({ title: "Selecione uma loja primeiro", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from("automations").insert({
        tenant_id: tenantId, name, trigger: trigger as any,
        actions: [{ type: "send_message", body }], conditions: {},
      });
      if (error) throw error;
      toast({ title: "Automação criada" });
      setOpen(false); setName(""); setBody("");
      qc.invalidateQueries({ queryKey: ["automations"] });
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <>
      <AdminHeader title="Automações" subtitle="Quando isso acontece, faça aquilo" actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>+ Nova automação</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova automação</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lembrete 24h antes" /></div>
              <div className="space-y-1.5"><Label>Gatilho</Label>
                <select value={trigger} onChange={(e) => setTrigger(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="lead_created">Novo lead</option>
                  <option value="no_response">Sem resposta</option>
                  <option value="appointment_scheduled">Reunião agendada</option>
                  <option value="appointment_reminder">Lembrete de reunião</option>
                  <option value="post_visit">Pós-visita</option>
                  <option value="inactivity">Cliente inativo</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label>Mensagem a enviar</Label><Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Olá {{nome}}, …" /></div>
              <Button onClick={create} disabled={busy || !name || !body} className="w-full">{busy ? "Salvando…" : "Criar"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      } />
      <div className="space-y-3 p-4 md:p-8">
        {automations.length === 0 && (
          <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
            Nenhuma automação configurada para esta loja ainda.
          </div>
        )}
        {automations.map((a) => (
          <div key={a.id} className="rounded-xl border bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="font-display font-semibold">{a.name}</h3>
                <div className="mt-2 grid gap-1.5 text-xs sm:grid-cols-2">
                  <div><span className="text-muted-foreground">Gatilho:</span> <strong>{a.trigger}</strong></div>
                  <div><span className="text-muted-foreground">Ações:</span> <strong>{Array.isArray(a.actions) ? (a.actions as any[]).length : 0}</strong></div>
                </div>
              </div>
              <Switch checked={a.active} onCheckedChange={(v) => toggle(a.id, v)} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
