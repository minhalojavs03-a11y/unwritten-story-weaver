import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import adminImage from "@/assets/feracon-admin-login.jpg";
import logoFeraconLight from "@/assets/logo-feracon-light.png";

export default function AdminLoginPage() {
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
  const redirectTo = from?.pathname?.startsWith("/admin") ? `${from.pathname}${from.search ?? ""}` : "/admin/dashboard";
  const { loading: authLoading, session, isSuperadmin } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-admin-login text-sm text-admin-login-foreground">Carregando…</div>;
  if (session) return <Navigate to={isSuperadmin ? redirectTo : "/login"} replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err: unknown) {
      toast({ title: "Acesso negado", description: err instanceof Error ? err.message : "Não foi possível entrar como superadmin", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-[hsl(0_0%_6%)] text-white lg:grid-cols-2">
      <aside className="relative h-56 overflow-hidden sm:h-72 lg:order-last lg:h-auto">
        <img src={adminImage} alt="Óculos premium em iluminação dramática" width={1280} height={1600} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[hsl(0_0%_6%)] via-[hsl(0_0%_6%)]/40 to-transparent lg:bg-gradient-to-l lg:from-transparent lg:via-transparent lg:to-[hsl(0_0%_6%)]" />
        <div className="absolute inset-0 bg-gradient-to-tr from-[hsl(var(--primary))]/15 via-transparent to-transparent" />
        <div className="absolute bottom-6 left-6 right-6 lg:bottom-12 lg:left-12 lg:right-12">
          <h2 className="font-display text-2xl font-bold leading-tight text-white drop-shadow-lg lg:text-4xl">Painel<br className="hidden lg:block" /> Superadmin.</h2>
          <p className="mt-2 max-w-md text-sm text-white/80 lg:text-base">Gestão completa de tenants, instâncias e operação.</p>
        </div>
      </aside>

      <section className="relative flex items-center justify-center overflow-hidden bg-[hsl(0_0%_6%)] p-6 sm:p-10 lg:p-16">
        <div className="pointer-events-none absolute -left-32 top-1/3 h-96 w-96 rounded-full bg-[hsl(var(--primary))]/12 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 bottom-1/4 h-96 w-96 rounded-full bg-[hsl(0_0%_20%)]/40 blur-3xl" />

        <div className="relative z-10 w-full max-w-sm">
          <div className="mb-8 flex flex-col items-start">
            <img src={logoFeraconLight} alt="Consórcio Feracon" className="mb-6 h-14 w-auto object-contain" />
            <h1 className="font-display text-3xl font-bold tracking-tight text-white">Superadmin</h1>
            <p className="mt-1.5 text-sm text-white/60">Acesso restrito ao painel administrativo</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="admin-email" className="text-white/80">Email superadmin</Label>
              <Input id="admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@consorciofera.com.br" required className="h-11 border-white/10 bg-white/[0.04] text-white placeholder:text-white/40" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-password" className="text-white/80">Senha</Label>
              <Input id="admin-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required className="h-11 border-white/10 bg-white/[0.04] text-white" />
            </div>
            <Button type="submit" className="h-11 w-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(357_80%_38%)] text-white shadow-lg shadow-[hsl(var(--primary))]/30 hover:opacity-95" disabled={loading}>
              {loading ? "Validando…" : "Entrar no superadmin"}
            </Button>
          </form>

          <p className="mt-10 text-xs text-white/40">© {new Date().getFullYear()} Consórcio Feracon — Painel administrativo</p>
        </div>
      </section>
    </main>
  );
}