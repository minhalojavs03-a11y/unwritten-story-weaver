import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { PinInput } from "@/components/onboarding/PinInput";
import { UsernameInput } from "@/components/onboarding/UsernameInput";
import { CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
import logoFeracon from "@/assets/logo-feracon-dark.png";

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { loading, session, isSuperadmin, onboardingCompleted, user, refreshProfile } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [displayName, setDisplayName] = useState((user?.user_metadata?.full_name as string | undefined) ?? "");
  const [username, setUsername] = useState("");
  const [usernameValid, setUsernameValid] = useState(false);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Carregando…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (isSuperadmin) return <Navigate to="/admin/dashboard" replace />;
  if (onboardingCompleted) return <Navigate to="/crm" replace />;

  const canContinue1 = displayName.trim().length >= 2 && usernameValid;
  const pinsMatch = pin.length >= 4 && pin === pinConfirm;

  async function handleFinish() {
    if (!pinsMatch) {
      toast({ title: "PINs não conferem", description: "Digite o mesmo PIN nas duas caixas.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("complete_onboarding", {
        _username: username,
        _display_name: displayName,
        _pin: pin,
      });
      if (error) throw error;
      await refreshProfile();
      toast({ title: `Bem-vindo, @${username}!`, description: "Identidade configurada com sucesso." });
      navigate("/crm", { replace: true });
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : "";
      let msg = "Não foi possível concluir. Tente novamente.";
      if (/username already taken/i.test(raw)) msg = "Este @username acabou de ser escolhido por outra pessoa. Tente outro.";
      else if (/invalid username/i.test(raw)) msg = "Username inválido.";
      else if (/pin must be/i.test(raw)) msg = "O PIN deve ter 4 a 6 dígitos.";
      else if (raw) msg = raw;
      toast({ title: "Ops", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-6 py-10">
        <div className="mb-8 flex items-center justify-center">
          <img src={logoFeracon} alt="Consórcio Feracon" className="h-12 w-auto object-contain" />
        </div>

        {/* Progress */}
        <div className="mb-10 flex items-center justify-center gap-3">
          <StepDot active={step >= 1} done={step > 1} label="Identidade" />
          <div className={`h-0.5 w-12 ${step > 1 ? "bg-primary" : "bg-border"}`} />
          <StepDot active={step >= 2} done={false} label="PIN" />
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">
          {step === 1 && (
            <div className="space-y-6">
              <header>
                <h1 className="text-2xl font-bold text-foreground">Crie sua identidade</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Como você quer ser identificado no CRM Feracon?
                </p>
              </header>

              <div className="space-y-1.5">
                <Label htmlFor="display-name">Seu nome completo</Label>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ex: Maria Aparecida Santos"
                  className="h-12"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label>Seu @usuário</Label>
                <UsernameInput value={username} onChange={setUsername} onValidityChange={setUsernameValid} />
              </div>

              <Button
                className="h-12 w-full"
                disabled={!canContinue1}
                onClick={() => setStep(2)}
              >
                Continuar
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <header>
                <h1 className="text-2xl font-bold text-foreground">Defina seu PIN</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Um código de 4 dígitos para confirmar ações rápidas no painel.
                </p>
              </header>

              <div className="space-y-2">
                <Label>PIN (4 dígitos)</Label>
                <PinInput length={4} value={pin} onChange={setPin} autoFocus />
              </div>

              <div className="space-y-2">
                <Label>Confirmar PIN</Label>
                <PinInput length={4} value={pinConfirm} onChange={setPinConfirm} />
                {pinConfirm.length === 4 && pin !== pinConfirm && (
                  <p className="text-xs text-destructive">Os PINs não conferem.</p>
                )}
                {pinsMatch && (
                  <p className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Confere!
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="h-12 flex-1" onClick={() => setStep(1)} disabled={saving}>
                  Voltar
                </Button>
                <Button className="h-12 flex-[2]" disabled={!pinsMatch || saving} onClick={handleFinish}>
                  {saving ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando…</>
                  ) : (
                    <>Concluir <ArrowRight className="ml-2 h-4 w-4" /></>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Consórcio Feracon
        </p>
      </div>
    </main>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
          done
            ? "border-primary bg-primary text-primary-foreground"
            : active
              ? "border-primary bg-background text-primary"
              : "border-border bg-background text-muted-foreground"
        }`}
      >
        {done ? <CheckCircle2 className="h-4 w-4" /> : label[0]}
      </div>
      <span className={`text-[10px] uppercase tracking-wide ${active ? "text-foreground" : "text-muted-foreground"}`}>
        {label}
      </span>
    </div>
  );
}
