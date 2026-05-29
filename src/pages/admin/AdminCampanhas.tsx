import { AdminHeader } from "./AdminHeader";
import { Button } from "@/components/ui/button";
import { Megaphone } from "lucide-react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export default function AdminCampanhas() {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: campaigns = [] } = useQuery({
    queryKey: ["campaigns", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("*, tenant:tenants(name)").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function create() {
    if (!tenantId) { toast({ title: "Sem loja selecionada", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from("campaigns").insert({
        tenant_id: tenantId, name, message_body: body, created_by: user?.id, status: "draft", audience_filter: {},
      });
      if (error) throw error;
      toast({ title: "Campanha criada" });
      setOpen(false); setName(""); setBody("");
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <>
      <AdminHeader title="Campanhas" subtitle="Disparos em massa para segmentos" actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>+ Nova campanha</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova campanha</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Black Friday" /></div>
              <div className="space-y-1.5"><Label>Mensagem</Label><Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Olá {{nome}}, …" /></div>
              <Button onClick={create} disabled={busy || !name || !body} className="w-full">{busy ? "Salvando…" : "Salvar como rascunho"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      } />
      <div className="p-4 md:p-8">
        {campaigns.length === 0 ? (
          <div className="rounded-xl border bg-card p-12 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-light text-primary">
              <Megaphone className="h-6 w-6" />
            </div>
            <h2 className="font-display text-lg font-semibold">Nenhuma campanha ainda</h2>
            <p className="mt-1 text-sm text-muted-foreground">Crie campanhas para reativar clientes inativos ou anunciar promoções.</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {campaigns.map((c: any) => (
              <div key={c.id} className="rounded-xl border bg-card p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display font-semibold">{c.name}</h3>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs capitalize">{c.status}</span>
                </div>
                <p className="mt-2 line-clamp-3 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground whitespace-pre-wrap">{c.message_body}</p>
                <div className="mt-2 text-xs text-muted-foreground">{c.tenant?.name} · {c.total_sent ?? 0}/{c.total_recipients ?? 0} enviadas</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
