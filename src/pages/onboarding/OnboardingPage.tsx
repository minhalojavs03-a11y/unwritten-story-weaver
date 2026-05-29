import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { loading, session, isSuperadmin, onboardingCompleted, tenantId, user, refreshProfile } = useAuth();
  const [name, setName] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [saving, setSaving] = useState(false);

  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (isSuperadmin) return <Navigate to="/admin/dashboard" replace />;
  if (tenantId && onboardingCompleted) return <Navigate to="/crm" replace />;

  async function handleFinish(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("create_tenant_with_owner", {
        _tenant_name: tenantName.trim(),
        _display_name: name.trim(),
      });
      if (error) throw error;

      await refreshProfile();
      toast({ title: "Pronto!", description: "Sua conta foi criada." });
      navigate("/crm", { replace: true });
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message ?? "Não foi possível concluir.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={handleFinish} className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6">
        <div>
          <h1 className="font-display text-xl font-semibold">Vamos configurar sua conta</h1>
          <p className="mt-1 text-sm text-muted-foreground">Preencha os dados básicos para começar.</p>
        </div>
        <div>
          <Label>Seu nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        </div>
        <div>
          <Label>Nome da empresa / time</Label>
          <Input value={tenantName} onChange={(e) => setTenantName(e.target.value)} required minLength={2} />
        </div>
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? "Salvando…" : "Concluir"}
        </Button>
      </form>
    </main>
  );
}
