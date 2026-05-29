import { useState } from "react";
import { AdminHeader } from "./AdminHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAllTenants } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

const statusBadge: Record<string, string> = {
  active: "bg-success/10 text-success",
  suspended: "bg-warning/10 text-warning",
  churned: "bg-destructive/10 text-destructive",
};

type AdminCreateTenantRpc = (
  fn: "admin_create_tenant",
  args: { _name: string; _plan: string }
) => Promise<{ error: { message: string } | null }>;

export default function AdminClientes() {
  const { data: tenants = [], isLoading } = useAllTenants();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [plan, setPlan] = useState("starter");
  const [busy, setBusy] = useState(false);

  async function createTenant() {
    setBusy(true);
    try {
      const adminCreateTenant = supabase.rpc as unknown as AdminCreateTenantRpc;
      const { error } = await adminCreateTenant("admin_create_tenant", { _name: name, _plan: plan });
      if (error) throw error;
      toast({ title: "Loja criada" });
      setOpen(false); setName(""); setPlan("starter");
      qc.invalidateQueries({ queryKey: ["all_tenants"] });
    } catch (e: unknown) { toast({ title: "Erro", description: e instanceof Error ? e.message : "Não foi possível criar a loja", variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <>
      <AdminHeader title="Clientes" subtitle="Todos os clientes" actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>+ Novo cliente</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova loja</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Plano</Label>
                <select value={plan} onChange={(e) => setPlan(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="starter">Starter</option><option value="profissional">Profissional</option><option value="rede">Rede</option>
                </select>
              </div>
              <Button onClick={createTenant} disabled={busy || !name} className="w-full">{busy ? "Criando…" : "Criar"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      } />
      <div className="p-4 md:p-8">
        {isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}
        {!isLoading && tenants.length === 0 && (
          <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
            Nenhuma loja ainda. Crie a primeira no botão acima.
          </div>
        )}
        {tenants.length > 0 && (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="min-w-full text-sm">
              <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-3">Loja</th><th className="px-4 py-3">Plano</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Criada em</th></tr>
              </thead>
              <tbody className="divide-y">
                {tenants.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-semibold">{t.name}</td>
                    <td className="px-4 py-3 capitalize">{t.plan}</td>
                    <td className="px-4 py-3"><span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${statusBadge[t.status] ?? ""}`}>{t.status}</span></td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(t.created_at).toLocaleDateString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
