import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import logoFeracon from "@/assets/logo-feracon-dark.png";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // O Supabase processa o hash (#access_token=...&type=recovery) e dispara PASSWORD_RECOVERY.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // Caso o usuário recarregue já com sessão de recovery ativa
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Senha curta", description: "Use ao menos 6 caracteres.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Senhas diferentes", description: "Confirme a mesma senha.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "Senha atualizada", description: "Faça login com a nova senha." });
      await supabase.auth.signOut();
      navigate("/login", { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Não foi possível atualizar a senha.";
      toast({ title: "Ops", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-sm">
        <img src={logoFeracon} alt="Consórcio Feracon" className="mb-6 h-16 w-auto object-contain" />
        <h1 className="font-display text-2xl font-bold text-slate-900">Definir nova senha</h1>
        <p className="mt-1 text-sm text-slate-500">
          {ready ? "Escolha uma nova senha para acessar sua conta." : "Validando link de recuperação…"}
        </p>
        {ready && (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="text-slate-700">Nova senha</Label>
              <Input id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-slate-700">Confirmar senha</Label>
              <Input id="confirm-password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={6} required className="h-11" />
            </div>
            <Button type="submit" className="h-11 w-full bg-[hsl(0_84%_50%)] text-white hover:bg-[hsl(0_84%_44%)]" disabled={loading}>
              {loading ? "Salvando…" : "Salvar nova senha"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
