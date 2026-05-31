import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useActiveMember } from "@/contexts/ActiveMemberContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";

type VerifyMemberRow = {
  id?: string;
  username?: string;
  display_name?: string;
  role_label?: string | null;
  avatar_color?: string | null;
};

export function MemberLoginDialog() {
  const { session, loading, isSuperadmin, refreshProfile } = useAuth();
  const { member, setMember } = useActiveMember();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }

  // Etapa de identificação interna removida — acesso direto após login
  const open = false;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 6000);
    try {
      const normalized = username.trim().replace(/^@/, "").toLowerCase();
      if (!session?.access_token) {
        toast({ title: "Sessão expirada", description: "Faça login novamente.", variant: "destructive" });
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/verify_tenant_member`, {
        method: "POST",
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ _username: normalized, _password: password }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string; error?: string } | null;
        throw new Error(body?.message ?? body?.error ?? "Erro ao validar acesso interno.");
      }

      const data = await response.json() as VerifyMemberRow[] | VerifyMemberRow | null;
      const row = (Array.isArray(data) ? data[0] : data) ?? null;
      if (!row?.id) {
        toast({ title: "Acesso negado", description: "Usuário ou senha inválidos.", variant: "destructive" });
        return;
      }
      setMember({
        id: row.id,
        username: row.username ?? normalized,
        display_name: row.display_name ?? normalized,
        role_label: row.role_label ?? null,
        avatar_color: row.avatar_color ?? null,
      }, { trustDevice });
      await refreshProfile();
      await queryClient.invalidateQueries();
      setPassword("");
      
    } catch (err) {
      const msg = err instanceof DOMException && err.name === "AbortError"
        ? "Tempo esgotado. Tente novamente."
        : err instanceof Error ? err.message : "Erro ao validar";
      console.error("[MemberLogin] erro", err);
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      window.clearTimeout(timeoutId);
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent
        className="w-[calc(100vw-2rem)] max-w-sm gap-5 !rounded-[28px] border border-black/5 p-6 shadow-2xl sm:max-w-sm [&>button.absolute]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="space-y-1.5 text-left">
          <DialogTitle className="font-display text-xl">Identifique-se</DialogTitle>
          <DialogDescription className="text-sm">
            Entre com seu @usuário e senha interna para usar o painel.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="member-username">@usuário</Label>
            <Input
              id="member-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="vendedorteste"
              autoComplete="off"
              autoFocus
              required
              className="h-12 rounded-2xl text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="member-password">Senha</Label>
            <Input
              id="member-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              required
              className="h-12 rounded-2xl text-base"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground select-none cursor-pointer">
            <input
              type="checkbox"
              checked={trustDevice}
              onChange={(e) => setTrustDevice(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            Confiar neste dispositivo (manter conectado)
          </label>
          <Button type="submit" className="h-12 w-full rounded-2xl text-base font-semibold" disabled={submitting}>
            {submitting ? "Verificando…" : "Entrar"}
          </Button>
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-1 inline-flex w-full items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
          >
            <LogOut className="h-3.5 w-3.5" /> Sair da conta
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
