import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, Plus, Trash2, UserCircle2 } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

type Role = "owner" | "supervisor" | "consultor";

const ROLES: { value: Role; label: string; description: string }[] = [
  { value: "owner", label: "Dono", description: "Acesso total. Pode gerenciar tudo." },
  { value: "supervisor", label: "Supervisor", description: "Gerencia equipe e leads, sem configurações sensíveis." },
  { value: "consultor", label: "Consultor", description: "Atende leads atribuídos a ele." },
];

type Invite = {
  id: string;
  email: string;
  role: Role;
  display_name: string | null;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type Member = {
  id: string;
  user_id: string;
  role: Role;
  display_name: string | null;
  created_at: string;
};

export default function ConvitesPage() {
  const { tenantId, tenantRole, user } = useAuth();
  const qc = useQueryClient();
  const canManage = tenantRole === "owner" || tenantRole === "supervisor";

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ email: string; role: Role; display_name: string }>({
    email: "", role: "consultor", display_name: "",
  });

  const invitesQuery = useQuery({
    queryKey: ["tenant_invites", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_invites")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Invite[];
    },
  });

  const membersQuery = useQuery({
    queryKey: ["tenant_memberships", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_memberships")
        .select("id, user_id, role, display_name, created_at")
        .eq("tenant_id", tenantId!)
        .order("created_at");
      if (error) throw error;
      return data as Member[];
    },
  });

  const profilesQuery = useQuery({
    queryKey: ["tenant_member_profiles", tenantId, membersQuery.data?.map((m) => m.user_id).join(",")],
    enabled: !!membersQuery.data && membersQuery.data.length > 0,
    queryFn: async () => {
      const ids = membersQuery.data!.map((m) => m.user_id);
      const { data, error } = await supabase.from("profiles").select("id, email, display_name").in("id", ids);
      if (error) throw error;
      return data as { id: string; email: string; display_name: string | null }[];
    },
  });

  const profileById = useMemo(() => {
    const map: Record<string, { email: string; display_name: string | null }> = {};
    for (const p of profilesQuery.data ?? []) map[p.id] = { email: p.email, display_name: p.display_name };
    return map;
  }, [profilesQuery.data]);

  const createInvite = useMutation({
    mutationFn: async () => {
      if (!tenantId || !user) throw new Error("Sem tenant");
      const email = form.email.trim().toLowerCase();
      if (!email) throw new Error("Informe um email");
      const { error } = await supabase.from("tenant_invites").insert({
        tenant_id: tenantId,
        email,
        role: form.role,
        display_name: form.display_name.trim() || null,
        invited_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant_invites", tenantId] });
      setOpen(false);
      setForm({ email: "", role: "consultor", display_name: "" });
      toast({ title: "Convite criado", description: "Copie o link e envie para a pessoa." });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const revokeInvite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tenant_invites").update({ revoked_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant_invites", tenantId] }),
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tenant_memberships").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant_memberships", tenantId] }),
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  function inviteUrl(token: string) {
    return `${window.location.origin}/invite/${token}`;
  }

  function copyLink(token: string) {
    navigator.clipboard.writeText(inviteUrl(token));
    toast({ title: "Link copiado" });
  }

  function statusOf(inv: Invite): { label: string; tone: string } {
    if (inv.revoked_at) return { label: "Revogado", tone: "bg-muted text-muted-foreground" };
    if (inv.accepted_at) return { label: "Aceito", tone: "bg-success/10 text-success" };
    if (new Date(inv.expires_at) < new Date()) return { label: "Expirado", tone: "bg-muted text-muted-foreground" };
    return { label: "Pendente", tone: "bg-primary/10 text-primary" };
  }

  return (
    <>
      <PageHeader title="Convites" subtitle="Gere um link e envie para a pessoa entrar na sua conta" />
      <div className="space-y-6 p-3 md:max-w-5xl md:p-8">
        <section className="rounded-xl border bg-card p-4 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              <h2 className="font-display text-base font-semibold md:text-lg">Convites</h2>
            </div>
            {canManage && (
              <Button size="sm" onClick={() => setOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> Novo convite
              </Button>
            )}
          </div>

          {(invitesQuery.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum convite ainda.</p>
          ) : (
            <div className="space-y-2">
              {invitesQuery.data!.map((inv) => {
                const s = statusOf(inv);
                const pending = !inv.accepted_at && !inv.revoked_at && new Date(inv.expires_at) >= new Date();
                return (
                  <div key={inv.id} className="rounded-lg border bg-muted/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{inv.email}</span>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{ROLES.find(r => r.value === inv.role)?.label}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs ${s.tone}`}>{s.label}</span>
                        </div>
                        {inv.display_name && <div className="text-xs text-muted-foreground">{inv.display_name}</div>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {pending && (
                          <Button size="sm" variant="outline" onClick={() => copyLink(inv.token)}>
                            <Copy className="mr-1 h-3.5 w-3.5" /> Copiar link
                          </Button>
                        )}
                        {canManage && pending && (
                          <Button size="icon" variant="ghost" onClick={() => { if (confirm("Revogar este convite?")) revokeInvite.mutate(inv.id); }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {pending && (
                      <div className="mt-2 break-all rounded bg-background px-2 py-1.5 font-mono text-xs text-muted-foreground">
                        {inviteUrl(inv.token)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-card p-4 md:p-6">
          <div className="mb-4 flex items-center gap-2">
            <UserCircle2 className="h-5 w-5 text-primary" />
            <h2 className="font-display text-base font-semibold md:text-lg">Membros da conta</h2>
          </div>
          {(membersQuery.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum membro.</p>
          ) : (
            <div className="space-y-2">
              {membersQuery.data!.map((m) => {
                const p = profileById[m.user_id];
                const isSelf = m.user_id === user?.id;
                return (
                  <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 p-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{m.display_name ?? p?.display_name ?? p?.email ?? "—"}</span>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{ROLES.find(r => r.value === m.role)?.label}</span>
                        {isSelf && <span className="text-xs text-muted-foreground">(você)</span>}
                      </div>
                      {p?.email && <div className="text-xs text-muted-foreground">{p.email}</div>}
                    </div>
                    {canManage && !isSelf && (
                      <Button size="icon" variant="ghost" onClick={() => { if (confirm("Remover este membro?")) removeMember.mutate(m.id); }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo convite</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="pessoa@email.com"
              />
              <p className="mt-1 text-xs text-muted-foreground">Pode ser qualquer email (Gmail, Outlook, etc).</p>
            </div>
            <div>
              <Label>Função</Label>
              <div className="mt-1 space-y-1">
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setForm({ ...form, role: r.value })}
                    className={`w-full rounded-md border p-3 text-left text-sm transition ${form.role === r.value ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                  >
                    <div className="font-medium">{r.label}</div>
                    <div className="text-xs text-muted-foreground">{r.description}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Nome para exibir (opcional)</Label>
              <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => createInvite.mutate()} disabled={createInvite.isPending || !form.email}>
              {createInvite.isPending ? "Criando…" : "Criar e gerar link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
