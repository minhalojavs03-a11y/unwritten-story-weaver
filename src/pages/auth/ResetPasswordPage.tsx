import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Supabase puts a recovery session in the URL hash. Wait for it.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: "Senhas diferentes", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "Senha atualizada" });
      navigate("/crm", { replace: true });
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message ?? "Não foi possível atualizar a senha.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-xl border bg-white p-6">
        <div>
          <h1 className="font-display text-xl font-semibold">Definir nova senha</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ready ? "Escolha uma nova senha de pelo menos 6 caracteres." : "Validando link…"}
          </p>
        </div>
        <div>
          <Label>Nova senha</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required disabled={!ready} />
        </div>
        <div>
          <Label>Confirmar senha</Label>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={6} required disabled={!ready} />
        </div>
        <Button type="submit" className="w-full" disabled={!ready || saving}>
          {saving ? "Salvando…" : "Salvar nova senha"}
        </Button>
      </form>
    </main>
  );
}
