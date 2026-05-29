import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

type Invite = {
  email: string;
  role: "owner" | "supervisor" | "consultor";
  tenant_name: string;
  display_name: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  owner: "Dono",
  supervisor: "Supervisor",
  consultor: "Consultor",
};

export default function InviteAcceptPage() {
  const { token = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { session, refreshProfile, loading: authLoading } = useAuth();

  const [invite, setInvite] = useState<Invite | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  // Fetch invite
  useEffect(() => {
    if (!token) { setError("Token ausente"); setLoadingInvite(false); return; }
    (async () => {
      const { data, error } = await supabase.rpc("get_invite_by_token", { _token: token }).maybeSingle();
      if (error || !data) setError("Convite inválido ou não encontrado");
      else {
        const inv = data as Invite;
        if (inv.revoked_at) setError("Este convite foi revogado");
        else if (inv.accepted_at) setError("Este convite já foi utilizado");
        else if (new Date(inv.expires_at) < new Date()) setError("Este convite expirou");
        else { setInvite(inv); setName(inv.display_name ?? ""); }
      }
      setLoadingInvite(false);
    })();
  }, [token]);

  // Auto-accept when logged in with matching email
  useEffect(() => {
    if (!invite || !session?.user?.email || authLoading) return;
    if (session.user.email.toLowerCase() !== invite.email.toLowerCase()) return;
    (async () => {
      setBusy(true);
      const { error } = await supabase.rpc("accept_tenant_invite", { _token: token });
      if (error) {
        toast({ title: "Não foi possível aceitar", description: error.message, variant: "destructive" });
        setBusy(false);
        return;
      }
      await refreshProfile();
      toast({ title: "Convite aceito!", description: `Você entrou em ${invite.tenant_name}.` });
      navigate("/crm", { replace: true });
    })();
  }, [invite, session, authLoading, token, navigate, refreshProfile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invite) return;
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: invite.email,
          password,
          options: {
            emailRedirectTo: window.location.href,
            data: { display_name: name || invite.display_name || invite.email.split("@")[0] },
          },
        });
        if (error) throw error;
        // Try immediate signin (works if email confirmation is disabled)
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: invite.email, password });
        if (signInError) {
          toast({
            title: "Conta criada",
            description: "Verifique seu email para confirmar e depois acesse o mesmo link.",
          });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: invite.email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      toast({ title: "Ops", description: err?.message ?? "Erro", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  if (loadingInvite || authLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando convite…</div>;
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-center">
          <h1 className="font-display text-xl font-semibold">Convite indisponível</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Button className="mt-6 w-full" onClick={() => navigate("/login")}>Ir para login</Button>
        </div>
      </main>
    );
  }

  if (!invite) return null;

  const emailMismatch = session?.user?.email && session.user.email.toLowerCase() !== invite.email.toLowerCase();

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Convite</p>
          <h1 className="mt-1 font-display text-xl font-semibold">{invite.tenant_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Você foi convidado(a) como <strong>{ROLE_LABEL[invite.role]}</strong> com o email <strong>{invite.email}</strong>.
          </p>
        </div>

        {emailMismatch ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive">
              Você está logado como <strong>{session?.user?.email}</strong>, mas este convite é para <strong>{invite.email}</strong>.
            </p>
            <Button variant="outline" className="w-full" onClick={async () => { await supabase.auth.signOut(); }}>
              Sair e usar outra conta
            </Button>
          </div>
        ) : session?.user ? (
          <p className="text-sm text-muted-foreground">Processando convite…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex gap-2 rounded-md bg-muted p-1 text-sm">
              <button type="button" onClick={() => setMode("signup")} className={`flex-1 rounded px-3 py-1.5 ${mode === "signup" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
                Criar conta
              </button>
              <button type="button" onClick={() => setMode("signin")} className={`flex-1 rounded px-3 py-1.5 ${mode === "signin" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
                Já tenho conta
              </button>
            </div>

            <div>
              <Label>Email</Label>
              <Input value={invite.email} disabled />
            </div>
            {mode === "signup" && (
              <div>
                <Label>Seu nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Como prefere ser chamado" required />
              </div>
            )}
            <div>
              <Label>Senha</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
            </div>

            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Aguarde…" : mode === "signup" ? "Criar conta e aceitar" : "Entrar e aceitar"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
