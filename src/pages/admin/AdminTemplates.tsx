import { useState } from "react";
import { AdminHeader } from "./AdminHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useTemplates } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

export default function AdminTemplates() {
  const { data: templates = [] } = useTemplates();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("followup");
  const [busy, setBusy] = useState(false);

  async function createTpl() {
    setBusy(true);
    try {
      const { error } = await supabase.from("templates").insert({ title, body, category, is_global: true });
      if (error) throw error;
      toast({ title: "Template criado" });
      setOpen(false); setTitle(""); setBody(""); setCategory("followup");
      qc.invalidateQueries({ queryKey: ["templates"] });
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <>
      <AdminHeader title="Mensagens prontas" subtitle="Templates reutilizáveis com variáveis" actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>+ Novo template</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo template</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Título</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Categoria</Label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="reminder">Lembrete</option><option value="followup">Acompanhamento</option><option value="reactivation">Reativação</option><option value="referral">Indicação</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label>Mensagem</Label><Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Olá {{nome}}, …" /></div>
              <Button onClick={createTpl} disabled={busy || !title || !body} className="w-full">{busy ? "Salvando…" : "Salvar"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      } />
      <div className="grid gap-4 p-4 md:grid-cols-2 md:p-8">
        {templates.length === 0 && (
          <div className="md:col-span-2 rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
            Nenhum template ainda.
          </div>
        )}
        {templates.map((t) => (
          <div key={t.id} className="rounded-xl border bg-card p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-display font-semibold">{t.title}</h3>
              <span className="rounded-md bg-primary-light px-2 py-0.5 text-xs font-medium text-primary">{t.category}</span>
            </div>
            <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground whitespace-pre-wrap">{t.body}</p>
          </div>
        ))}
      </div>
    </>
  );
}
