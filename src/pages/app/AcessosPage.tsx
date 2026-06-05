import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "./PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Eye, EyeOff, Copy, Plus, Pencil, Trash2, KeyRound, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { isHiddenFeraconPerson } from "@/lib/feracon";

type Cred = {
  id: string;
  tenant_id: string;
  label: string;
  category: string;
  identifier: string | null;
  password: string | null;
  url: string | null;
  notes: string | null;
  position: number;
};

const CATEGORIES = [
  { value: "social", label: "Rede Social" },
  { value: "email", label: "E-mail" },
  { value: "marketplace", label: "Marketplace" },
  { value: "banco", label: "Banco" },
  { value: "ferramenta", label: "Ferramenta" },
  { value: "outro", label: "Outro" },
];

function CopyBtn({ value }: { value: string }) {
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(value); toast({ title: "Copiado" }); }}
      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Copy className="h-3.5 w-3.5" />
    </button>
  );
}

function PasswordCell({ value }: { value: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <span className="font-mono text-sm">{show ? value : "•".repeat(Math.min(10, value.length))}</span>
      <button type="button" onClick={() => setShow(!show)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      <CopyBtn value={value} />
    </div>
  );
}

export default function AcessosPage() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Cred> | null>(null);

  const { data: creds = [] } = useQuery({
    queryKey: ["tenant_credentials", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.from("tenant_credentials").select("*").order("position").order("label");
      if (error) throw error;
      return data as Cred[];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["tenant_members_all", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_members")
        .select("username, display_name, role_label, is_active")
        .eq("tenant_id", tenantId!)
        .order("display_name");
      if (error) throw error;
      return (data ?? []).filter((m) => !isHiddenFeraconPerson(m as any));
    },
  });

  const save = useMutation({
    mutationFn: async (c: Partial<Cred>) => {
      if (c.id) {
        const { error } = await supabase.from("tenant_credentials").update({
          label: c.label, category: c.category, identifier: c.identifier, password: c.password, url: c.url, notes: c.notes,
        }).eq("id", c.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tenant_credentials").insert({
          tenant_id: tenantId!, label: c.label!, category: c.category ?? "outro",
          identifier: c.identifier, password: c.password, url: c.url, notes: c.notes,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tenant_credentials"] }); setEditing(null); toast({ title: "Salvo" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tenant_credentials").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tenant_credentials"] }); toast({ title: "Removido" }); },
  });

  // Senhas conhecidas dos membros internos (padrão definido na criação dos perfis)
  const memberPasswordHint = (username: string): string => {
    if (username === "donoferacon") return "donofera123!";
    if (username.startsWith("supervisor")) return username.replace("supervisor", "") + "123";
    if (username.startsWith("consultor")) return username.replace("consultor", "") + "123";
    return "—";
  };

  return (
    <>
      <PageHeader title="Acessos" subtitle="Senhas da loja e usuários do CRM" />
      <div className="space-y-6 p-3 md:max-w-5xl md:p-8">
        <section className="rounded-xl border bg-card p-4 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              <h2 className="font-display text-base font-semibold md:text-lg">Acessos da loja</h2>
            </div>
            <Button size="sm" onClick={() => setEditing({ category: "outro" })}>
              <Plus className="mr-1 h-4 w-4" /> Adicionar
            </Button>
          </div>

          {creds.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum acesso cadastrado.</p>
          ) : (
            <div className="space-y-3">
              {creds.map((c) => (
                <div key={c.id} className="rounded-lg border bg-muted/20 p-3 md:p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{c.label}</span>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{CATEGORIES.find(x => x.value === c.category)?.label ?? c.category}</span>
                      </div>
                      {c.url && <a href={c.url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground underline">{c.url}</a>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => { if (confirm("Remover este acesso?")) remove.mutate(c.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </div>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    {c.identifier && (
                      <div>
                        <div className="text-xs text-muted-foreground">Usuário / E-mail</div>
                        <div className="flex items-center gap-1"><span className="break-all">{c.identifier}</span><CopyBtn value={c.identifier} /></div>
                      </div>
                    )}
                    {c.password && (
                      <div>
                        <div className="text-xs text-muted-foreground">Senha</div>
                        <PasswordCell value={c.password} />
                      </div>
                    )}
                  </div>
                  {c.notes && <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">{c.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-card p-4 md:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="font-display text-base font-semibold md:text-lg">Usuários do CRM</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Nome</th>
                  <th className="py-2 pr-3">Usuário</th>
                  <th className="py-2 pr-3">Função</th>
                  <th className="py-2 pr-3">Senha</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m: any) => {
                  const pwd = memberPasswordHint(m.username);
                  return (
                    <tr key={m.username} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{m.display_name}</td>
                      <td className="py-2 pr-3"><span className="font-mono text-xs">@{m.username}</span></td>
                      <td className="py-2 pr-3 text-muted-foreground">{m.role_label ?? "—"}</td>
                      <td className="py-2 pr-3"><PasswordCell value={pwd} /></td>
                      <td className="py-2 pr-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${m.is_active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                          {m.is_active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Senhas exibidas seguem o padrão usado na criação dos perfis. Caso o usuário tenha alterado, esta lista pode estar desatualizada.
          </p>
        </section>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar acesso" : "Novo acesso"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Nome / Serviço</Label><Input value={editing.label ?? ""} onChange={(e) => setEditing({ ...editing, label: e.target.value })} placeholder="Ex.: Instagram" /></div>
              <div>
                <Label>Categoria</Label>
                <select value={editing.category ?? "outro"} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div><Label>Usuário / E-mail</Label><Input value={editing.identifier ?? ""} onChange={(e) => setEditing({ ...editing, identifier: e.target.value })} /></div>
              <div><Label>Senha</Label><Input value={editing.password ?? ""} onChange={(e) => setEditing({ ...editing, password: e.target.value })} /></div>
              <div><Label>URL</Label><Input value={editing.url ?? ""} onChange={(e) => setEditing({ ...editing, url: e.target.value })} placeholder="https://..." /></div>
              <div><Label>Observações</Label><Textarea rows={3} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => editing?.label && save.mutate(editing)} disabled={!editing?.label || save.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
