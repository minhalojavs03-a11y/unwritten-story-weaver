import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users2, LogIn, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAllTenants } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Props = { open: boolean; onOpenChange: (v: boolean) => void };

export function ImpersonateDialog({ open, onOpenChange }: Props) {
  const { data: tenants = [], isLoading } = useAllTenants();
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const navigate = useNavigate();

  const filtered = tenants.filter((t) =>
    (t.name ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  async function impersonate(tenantId: string, tenantName: string) {
    setBusyId(tenantId);
    try {
      const { data, error } = await supabase.functions.invoke("superadmin-impersonate", {
        body: { tenant_id: tenantId },
      });
      if (error) throw error;
      const { previous_tenant_id } = data as { previous_tenant_id: string | null };

      // Limpa qualquer membro interno previamente selecionado (do tenant anterior)
      // para não vazar escopo nem esconder conversas do tenant impersonado.
      try {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith("feracon.activeMember")) keys.push(k);
        }
        keys.forEach((k) => localStorage.removeItem(k));
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith("feracon.activeMember")) sessionStorage.removeItem(k);
        }
      } catch { /* ignore */ }

      localStorage.setItem(
        "impersonation_context",
        JSON.stringify({
          tenant_id: tenantId,
          tenant_name: tenantName,
          previous_tenant_id,
        }),
      );
      toast({ title: `Entrando como ${tenantName}` });
      onOpenChange(false);
      navigate("/dashboard", { replace: true });
      setTimeout(() => window.location.reload(), 100);
    } catch (e: unknown) {
      toast({
        title: "Erro ao trocar de conta",
        description: e instanceof Error ? e.message : "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-white/10 bg-[hsl(0_0%_8%)] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Users2 className="h-4 w-4" /> Entrar como cliente
          </DialogTitle>
          <DialogDescription className="text-white/60">
            Acesse o painel de qualquer cliente para suporte. A sessão fica registrada.
          </DialogDescription>
        </DialogHeader>
        <Input
          placeholder="Buscar cliente…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="border-white/10 bg-white/5 text-white placeholder:text-white/40"
        />
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {isLoading && <div className="p-4 text-sm text-white/60">Carregando…</div>}
          {!isLoading && filtered.length === 0 && (
            <div className="p-4 text-center text-sm text-white/50">Nenhum cliente encontrado</div>
          )}
          {filtered.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{t.name}</div>
                <div className="text-[11px] text-white/50">{t.plan} · {t.status}</div>
              </div>
              <Button
                size="sm"
                onClick={() => impersonate(t.id, t.name)}
                disabled={!!busyId}
                className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(357_80%_38%)] text-white"
              >
                {busyId === t.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <><LogIn className="mr-1 h-3.5 w-3.5" /> Entrar</>
                )}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
