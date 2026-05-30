import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { ROLE_LABELS, type TenantRole } from "@/hooks/useRoleInvites";
import { toast } from "sonner";

interface InviteInfo {
  role: TenantRole;
  role_label: string | null;
  tenant_id: string;
  tenant_name: string;
  is_active: boolean;
  expires_at: string | null;
  max_uses: number | null;
  uses_count: number;
}

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data, error } = await supabase.rpc("get_role_invite_by_token" as never, { _token: token } as never);
      if (error || !data || (Array.isArray(data) && data.length === 0)) {
        setError("Link inválido ou expirado");
        return;
      }
      const row = (Array.isArray(data) ? data[0] : data) as InviteInfo;
      if (!row.is_active) setError("Este link foi desativado");
      else if (row.expires_at && new Date(row.expires_at) < new Date()) setError("Link expirado");
      else if (row.max_uses != null && row.uses_count >= row.max_uses) setError("Limite de usos atingido");
      setInfo(row);
    })();
  }, [token]);

  async function handleAccept() {
    if (!token) return;
    if (!user) {
      navigate(`/login?next=/join/${token}`);
      return;
    }
    setAccepting(true);
    const { error } = await supabase.rpc("accept_role_invite" as never, { _token: token } as never);
    setAccepting(false);
    if (error) {
      toast.error(error.message);
      setError(error.message);
      return;
    }
    toast.success("Bem-vindo à equipe!");
    navigate("/crm", { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
        {!info && !error && (
          <div className="flex flex-col items-center gap-3 py-6 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Verificando convite...</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <XCircle className="h-10 w-10 text-destructive" />
            <h1 className="text-lg font-semibold">Não foi possível entrar</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => navigate("/login")}>Ir para login</Button>
          </div>
        )}

        {info && !error && (
          <div className="space-y-5 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <div>
              <h1 className="text-xl font-bold">{info.tenant_name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Você está sendo convidado como{" "}
                <span className="font-semibold text-foreground">
                  {info.role_label || ROLE_LABELS[info.role]}
                </span>
              </p>
            </div>

            {loading ? (
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            ) : user ? (
              <Button className="w-full" onClick={handleAccept} disabled={accepting}>
                {accepting ? "Entrando..." : "Aceitar convite"}
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Faça login ou crie sua conta para continuar.</p>
                <Button className="w-full" onClick={() => navigate(`/login?next=/join/${token}`)}>
                  Entrar / Criar conta
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
