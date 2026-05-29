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

const clientRoutes = ["/crm", "/conversas", "/pipeline", "/agenda", "/clientes", "/configuracoes"];

export default function ClientLoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const LOGIN_GATE_KEY = "feracon.loginGate.passed";
  const from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
  const fromPath = from?.pathname;
  const redirectTo = fromPath && clientRoutes.some((path) => fromPath === path || fromPath.startsWith(`${path}/`))
    ? `${fromPath}${from?.search ?? ""}`
    : "/crm";
  const { loading: authLoading, session, isSuperadmin, user } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  if (authLoading) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando…</div>;
  if (session && isSuperadmin) return <Navigate to="/admin/dashboard" replace />;
  if (session) {
    sessionStorage.setItem(LOGIN_GATE_KEY, "1");
    return <Navigate to={redirectTo} replace />;
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      sessionStorage.removeItem(LOGIN_GATE_KEY);
      await supabase.auth.signOut();
    } finally {
      setSigningOut(false);
    }
  }

  function handleContinue() {
    sessionStorage.setItem(LOGIN_GATE_KEY, "1");
    navigate(redirectTo, { replace: true });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const normalizedEmail = email.trim().toLowerCase();
        const { error: registerError } = await supabase.functions.invoke("register-client", {
          body: { email: normalizedEmail, password, fullName, tenantName: fullName },
        });
        if (registerError) {
          let message = registerError.message;
          const response = (registerError as { context?: unknown }).context;
          if (response instanceof Response) {
            const body = await response.clone().json().catch(() => null) as { error?: string } | null;
            message = body?.error ?? message;
          }
          throw new Error(message);
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (signInError) throw signInError;
        toast({ title: "Conta criada", description: "Bem-vindo!" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        if (error) throw error;
      }
      sessionStorage.setItem(LOGIN_GATE_KEY, "1");
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

  return (
    <main className="grid min-h-screen bg-white text-slate-900 lg:grid-cols-2">
      {/* Visual side */}
      <aside className="relative h-80 overflow-hidden sm:h-96 lg:order-last lg:h-auto">
        <img src={opticaImage} alt="Consórcio Feracon" width={1280} height={1600} className="absolute inset-0 h-full w-full object-cover object-[center_20%] lg:object-center" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        <div className="absolute bottom-6 left-6 right-6 lg:bottom-12 lg:left-12 lg:right-12">
          <span className="inline-block rounded-full bg-[hsl(0_84%_50%)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white shadow-md">CRM Feracon</span>
          <h2 className="mt-3 font-display text-2xl font-bold leading-tight text-white drop-shadow-lg lg:text-4xl">O CRM Equipe Feracon</h2>
          <p className="mt-2 max-w-md text-sm text-white/90 lg:text-base">Leads, atendimento e vendas conectados em um só lugar.</p>
        </div>
      </aside>

      {/* Form side */}
      <section className="relative flex items-center justify-center p-6 sm:p-10 lg:p-16">
        <div className="relative z-10 w-full max-w-sm">
          <div className="mb-8 flex flex-col items-start">
            <img src={logoFeracon} alt="Consórcio Feracon" className="mb-5 h-20 w-auto object-contain" />
            <p className="mt-1.5 text-sm text-slate-500">
              {session ? "Você já está conectado" : mode === "signin" ? "Entre na sua conta de cliente" : "Crie sua conta de cliente"}
            </p>
          </div>

          {session ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Sessão ativa</p>
                <p className="mt-1 break-all text-sm font-semibold text-slate-900">{user?.email}</p>
              </div>
              <Button
                type="button"
                onClick={handleContinue}
                className="h-11 w-full bg-[hsl(0_84%_50%)] text-white shadow-md transition hover:bg-[hsl(0_84%_44%)]"
              >
                Continuar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleSignOut}
                disabled={signingOut}
                className="h-11 w-full"
              >
                {signingOut ? "Saindo…" : "Sair e entrar com outra conta"}
              </Button>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="client-email" className="text-slate-700">Email</Label>
                  <Input id="client-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@feracon.com" required className="h-11 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus-visible:ring-[hsl(0_84%_50%)]" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="client-password" className="text-slate-700">Senha</Label>
                  <Input id="client-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required className="h-11 border-slate-200 bg-slate-50 text-slate-900 focus-visible:ring-[hsl(0_84%_50%)]" />
                </div>
                <Button type="submit" className="h-11 w-full bg-[hsl(0_84%_50%)] text-white shadow-md transition hover:bg-[hsl(0_84%_44%)]" disabled={loading}>
                  {loading ? "Aguarde…" : "Entrar"}
                </Button>
              </form>
            </>
          )}

          <p className="mt-10 text-xs text-slate-400">© {new Date().getFullYear()} Consórcio Feracon</p>
        </div>
      </section>
    </main>
  );
}