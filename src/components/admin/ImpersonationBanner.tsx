import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert, LogOut, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Ctx = { tenant_id: string; tenant_name: string; email: string };

export function ImpersonationBanner() {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const read = () => {
      const raw = localStorage.getItem("impersonation_context");
      setCtx(raw ? (JSON.parse(raw) as Ctx) : null);
    };
    read();
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, []);

  if (!ctx) return null;

  async function exitImpersonation() {
    setBusy(true);
    try {
      const raw = localStorage.getItem("superadmin_return_session");
      if (!raw) throw new Error("Sessão do superadmin não encontrada");
      const saved = JSON.parse(raw) as { access_token: string; refresh_token: string };
      await supabase.auth.signOut();
      const { error } = await supabase.auth.setSession({
        access_token: saved.access_token,
        refresh_token: saved.refresh_token,
      });
      if (error) throw error;
      localStorage.removeItem("impersonation_context");
      localStorage.removeItem("superadmin_return_session");
      toast({ title: "Voltou para Superadmin" });
      navigate("/admin/dashboard", { replace: true });
      setTimeout(() => window.location.reload(), 100);
    } catch (e: unknown) {
      toast({
        title: "Erro ao sair da conta",
        description: e instanceof Error ? e.message : "Faça login novamente",
        variant: "destructive",
      });
      localStorage.removeItem("impersonation_context");
      localStorage.removeItem("superadmin_return_session");
      navigate("/admin/login", { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/15 px-3 py-2 text-xs text-amber-900 backdrop-blur md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
        <span className="truncate">
          <strong>Modo suporte</strong> · Visualizando como <strong>{ctx.tenant_name}</strong>
          <span className="ml-1 hidden text-amber-800/70 sm:inline">({ctx.email})</span>
        </span>
      </div>
      <button
        onClick={exitImpersonation}
        disabled={busy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
        Voltar ao Superadmin
      </button>
    </div>
  );
}
