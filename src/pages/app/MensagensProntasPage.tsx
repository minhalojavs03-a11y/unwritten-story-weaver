import { useState } from "react";
import { Plus, Pencil, Trash2, Globe, MessageSquareText } from "lucide-react";
import { PageHeader } from "@/pages/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useTemplates, useUpsertTemplate, useDeleteTemplate, type Template } from "@/hooks/useTemplates";

export default function MensagensProntasPage() {
  const { data: templates = [], isLoading } = useTemplates();
  const upsert = useUpsertTemplate();
  const del = useDeleteTemplate();
  const [editing, setEditing] = useState<Template | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("");

  function openNew() {
    setEditing(null);
    setTitle(""); setBody(""); setCategory("");
    setOpen(true);
  }
  function openEdit(t: Template) {
    setEditing(t);
    setTitle(t.title ?? t.name ?? "");
    setBody(t.body ?? t.content ?? "");
    setCategory(t.category ?? "");
    setOpen(true);
  }

  async function save() {
    if (!title.trim() || !body.trim()) {
      toast({ title: "Preencha título e mensagem", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync({ id: editing?.id, title: title.trim(), body: body.trim(), category: category.trim() || null });
      toast({ title: editing ? "Mensagem atualizada" : "Mensagem criada" });
      setOpen(false);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  }

  async function remove(t: Template) {
    if (t.is_global) { toast({ title: "Mensagens padrão não podem ser excluídas" }); return; }
    if (!confirm(`Excluir "${t.title ?? t.name}"?`)) return;
    try { await del.mutateAsync(t.id); toast({ title: "Excluída" }); }
    catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  }

  const globals = templates.filter((t) => t.is_global);
  const customs = templates.filter((t) => !t.is_global);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title="Mensagens prontas"
        subtitle="Modelos rápidos para enviar nas conversas. Use {{nome}} para personalizar."
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Nova mensagem</Button>}
      />

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Globe className="h-4 w-4" /> Padrões</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {globals.map((t) => (
            <TemplateCard key={t.id} t={t} onEdit={() => openEdit(t)} onDelete={() => remove(t)} />
          ))}
          {globals.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma mensagem padrão.</p>}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><MessageSquareText className="h-4 w-4" /> Minhas mensagens</h2>
        <p className="text-xs text-muted-foreground">Use o atalho <code className="rounded bg-muted px-1">/1</code>, <code className="rounded bg-muted px-1">/2</code>… no chat para inserir rapidamente.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {customs.map((t, i) => (
            <TemplateCard key={t.id} t={t} shortcut={`/${i + 1}`} onEdit={() => openEdit(t)} onDelete={() => remove(t)} />
          ))}
          {customs.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma mensagem personalizada ainda. Clique em "Nova mensagem".</p>}
        </div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Editar mensagem" : "Nova mensagem pronta"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Saudação inicial" disabled={editing?.is_global} />
            </div>
            <div>
              <Label>Categoria (opcional)</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="saudacao, follow-up, fechamento…" disabled={editing?.is_global} />
            </div>
            <div>
              <Label>Mensagem</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6}
                placeholder="Olá {{nome}}! Tudo bem?" disabled={editing?.is_global} />
              <p className="mt-1 text-xs text-muted-foreground">Use <code>{"{{nome}}"}</code> para inserir o nome do lead.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            {!editing?.is_global && <Button onClick={save} disabled={upsert.isPending}>Salvar</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplateCard({ t, onEdit, onDelete, shortcut }: { t: Template; onEdit: () => void; onDelete: () => void; shortcut?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {shortcut && <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary">{shortcut}</span>}
            <h3 className="truncate text-sm font-semibold">{t.title ?? t.name}</h3>
            {t.is_global && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">padrão</span>}
          </div>
          {t.category && <p className="text-xs text-muted-foreground">{t.category}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit} aria-label="Editar">
            <Pencil className="h-4 w-4" />
          </Button>
          {!t.is_global && (
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={onDelete} aria-label="Excluir">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{t.body ?? t.content}</p>
    </div>
  );
}
