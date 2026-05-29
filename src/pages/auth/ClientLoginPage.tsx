import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import opticaImage from "@/assets/feracon-login.png";
import logoFeracon from "@/assets/logo-feracon-dark.png";

export default function ClientLoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
  const redirectTo = from?.pathname ? `${from.pathname}${from.search ?? ""}` : "/crm";
  const { loading: authLoading, session, isSuperadmin, user } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  if (authLoading) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando…</div>;
  if (session && isSuperadmin) return <Navigate to="/admin/dashboard" replace />;
  if (session) return <Navigate to={redirectTo} replace />;

  async function handleSignOut() {
    setSigningOut(true);
    try { await supabase.auth.signOut(); } finally { setSigningOut(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/crm`,
            data: { display_name: fullName.trim() },
          },
        });
        if (error) throw error;
        toast({ title: "Conta criada", description: "Bem-vindo!" });
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast({ title: "Email enviado", description: "Confira sua caixa de entrada para redefinir a senha." });
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (error) throw error;
      }
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "";
      let friendly = "Não foi possível continuar. Tente novamente.";
      if (/invalid login|invalid credentials/i.test(raw)) friendly = "Email ou senha incorretos.";
      else if (/already registered|already exists|user already/i.test(raw)) friendly = "Este email já possui uma conta. Faça login.";
      else if (/password/i.test(raw) && /short|6/i.test(raw)) friendly = "A senha deve ter ao menos 6 caracteres.";
      else if (/rate limit/i.test(raw)) friendly = "Muitas tentativas. Aguarde alguns minutos.";
      else if (raw) friendly = raw;
      toast({ title: "Ops", description: friendly, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const title = mode === "signin" ? "Entre na sua conta" : mode === "signup" ? "Crie sua conta" : "Recuperar senha";

  return (
    <main className="grid min-h-screen bg-white text-slate-900 lg:grid-cols-2">
      <aside className="relative h-80 overflow-hidden sm:h-96 lg:order-last lg:h-auto">
        <img src={opticaImage} alt="Consórcio Feracon" className="absolute inset-0 h-full w-full object-cover object-[center_20%] lg:object-center" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        <div className="absolute bottom-6 left-6 right-6 lg:bottom-12 lg:left-12 lg:right-12">
          <span className="inline-block rounded-full bg-[hsl(0_84%_50%)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white shadow-md">CRM Feracon</span>
          <h2 className="mt-3 font-display text-2xl font-bold leading-tight text-white drop-shadow-lg lg:text-4xl">O CRM Equipe Feracon</h2>
        </div>
      </aside>

      <section className="relative flex items-center justify-center p-6 sm:p-10 lg:p-16">
        <div className="relative z-10 w-full max-w-sm">
          <div className="mb-8 flex flex-col items-start">
            <img src={logoFeracon} alt="Consórcio Feracon" className="mb-5 h-20 w-auto object-contain" />
            <h1 className="font-display text-2xl font-bold">{title}</h1>
            <p className="mt-1.5 text-sm text-slate-500">
              {mode === "signup" ? "Use seu email para começar" : mode === "forgot" ? "Enviaremos um link para você redefinir" : "Bem-vindo de volta"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="fullname">Seu nome</Label>
                <Input id="fullname" value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} className="h-11" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11" />
            </div>
            {mode !== "forgot" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Senha</Label>
                  {mode === "signin" && (
                    <button type="button" onClick={() => setMode("forgot")} className="text-xs text-[hsl(0_84%_50%)] hover:underline">
                      Esqueci minha senha
                    </button>
                  )}
                </div>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required className="h-11" />
              </div>
            )}
            <Button type="submit" className="h-11 w-full bg-[hsl(0_84%_50%)] text-white hover:bg-[hsl(0_84%_44%)]" disabled={loading}>
              {loading ? "Aguarde…" : mode === "signup" ? "Criar conta" : mode === "forgot" ? "Enviar link" : "Entrar"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-500">
            {mode === "signin" && (
              <>Não tem conta? <button onClick={() => setMode("signup")} className="font-medium text-[hsl(0_84%_50%)] hover:underline">Criar conta</button></>
            )}
            {mode === "signup" && (
              <>Já tem conta? <button onClick={() => setMode("signin")} className="font-medium text-[hsl(0_84%_50%)] hover:underline">Entrar</button></>
            )}
            {mode === "forgot" && (
              <button onClick={() => setMode("signin")} className="font-medium text-[hsl(0_84%_50%)] hover:underline">Voltar ao login</button>
            )}
          </div>

          {user && (
            <Button type="button" variant="outline" onClick={handleSignOut} disabled={signingOut} className="mt-4 h-11 w-full">
              {signingOut ? "Saindo…" : "Sair"}
            </Button>
          )}

          <p className="mt-10 text-xs text-slate-400">© {new Date().getFullYear()} Consórcio Feracon</p>
        </div>
      </section>
    </main>
  );
}
