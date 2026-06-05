import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Users2, LogIn, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useActiveMember } from "@/contexts/ActiveMemberContext";
import { FERACON_TENANT_ID, isHiddenFeraconPerson } from "@/lib/feracon";

type Props = { open: boolean; onOpenChange: (v: boolean) => void };

type MemberRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  role_label: string | null;
  avatar_color: string | null;
  avatar_url: string | null;
};

function inferTargetRole(roleLabel: string | null | undefined): string {
  const r = (roleLabel ?? "").toLowerCase();
  if (r.includes("dono") || r.includes("owner") || r.includes("proprietár")) return "owner";
  if (r.includes("supervisor") || r.includes("gerente") || r.includes("gestor")) return "supervisor";
  if (r.includes("atendente") || r.includes("attendant")) return "attendant";
  return "consultant";
}

export function ImpersonateDialog({ open, onOpenChange }: Props) {
  const { setMember } = useActiveMember();
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const navigate = useNavigate();

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["impersonate-members", FERACON_TENANT_ID],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_tenant_members_public", {
        _tenant_id: FERACON_TENANT_ID,
      });
      if (error) throw error;
      return ((data ?? []) as MemberRow[]).filter((m) => {
        const name = (m.display_name ?? "").toLowerCase();
        if (name.includes("teste")) return false;
        if (isHiddenFeraconPerson(m as any)) return false;
        return true;
      });
    },
  });

  const filtered = useMemo(() => {
    const term = q.toLowerCase().trim();
    if (!term) return members;
    return members.filter(
      (m) =>
        (m.display_name ?? "").toLowerCase().includes(term) ||
        (m.username ?? "").toLowerCase().includes(term) ||
        (m.role_label ?? "").toLowerCase().includes(term),
    );
  }, [members, q]);

  async function impersonate(m: MemberRow) {
    setBusyId(m.id);
    try {
      const targetRole = inferTargetRole(m.role_label);

      // Limpa qualquer active member anterior para não vazar contexto
      try {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith("feracon.activeMember")) keys.push(k);
        }
        keys.forEach((k) => localStorage.removeItem(k));
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith("feracon.activeMember")) sessionStorage.removeItem(k);
        }
      } catch {
        /* ignore */
      }

      // Grava contexto de impersonação (com target_role para demover poderes de superadmin)
      localStorage.setItem(
        "impersonation_context",
        JSON.stringify({
          tenant_id: FERACON_TENANT_ID,
          tenant_name: m.display_name ?? "Usuário",
          previous_tenant_id: null,
          target_role: targetRole,
          target_member_id: m.id,
        }),
      );

      // Define o membro ativo (faz o useEffectiveRole tratar como aquele papel)
      setMember(
        {
          id: m.id,
          username: m.username ?? "",
          display_name: m.display_name ?? "Usuário",
          role_label: m.role_label ?? null,
          avatar_color: m.avatar_color ?? null,
        },
        { trustDevice: false },
      );

      // Log no banco (best effort)
      try {
        const { data: sess } = await supabase.auth.getUser();
        if (sess?.user?.id) {
          await supabase.from("impersonation_log").insert({
            admin_user_id: sess.user.id,
            target_user_id: sess.user.id,
            tenant_id: FERACON_TENANT_ID,
            reason: `Entrar como ${m.display_name ?? m.username ?? "usuário"} (${targetRole})`,
          });
        }
      } catch {
        /* ignore log errors */
      }

      window.dispatchEvent(new Event("feracon:impersonation"));

      toast({ title: `Entrando como ${m.display_name ?? "usuário"}` });
      onOpenChange(false);
      navigate("/dashboard", { replace: true });
      setTimeout(() => window.location.reload(), 100);
    } catch (e: unknown) {
      toast({
        title: "Erro ao trocar de conta",
        description: e instanceof Error ? e.message : "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-white/10 bg-[hsl(0_0%_8%)] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Users2 className="h-4 w-4" /> Entrar como usuário
          </DialogTitle>
          <DialogDescription className="text-white/60">
            Acesse o painel de qualquer pessoa da Feracon para suporte. A sessão fica registrada.
          </DialogDescription>
        </DialogHeader>
        <Input
          placeholder="Buscar por nome, usuário ou cargo…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="border-white/10 bg-white/5 text-white placeholder:text-white/40"
        />
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {isLoading && <div className="p-4 text-sm text-white/60">Carregando…</div>}
          {!isLoading && filtered.length === 0 && (
            <div className="p-4 text-center text-sm text-white/50">
              Nenhum usuário encontrado
            </div>
          )}
          {filtered.map((m) => {
            const initials = (m.display_name ?? m.username ?? "?")
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0])
              .join("")
              .toUpperCase();
            const color = m.avatar_color ?? "#1E40AF";
            return (
              <div
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ background: color }}
                  >
                    {m.avatar_url ? (
                      <img
                        src={m.avatar_url}
                        alt={m.display_name ?? ""}
                        className="h-full w-full rounded-full object-cover"
                      />
                    ) : (
                      initials
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">
                      {m.display_name ?? m.username}
                    </div>
                    <div className="text-[11px] text-white/50">
                      {m.role_label ?? "Consultor"}
                      {m.username ? ` · @${m.username}` : ""}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => impersonate(m)}
                  disabled={!!busyId}
                  className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(357_80%_38%)] text-white"
                >
                  {busyId === m.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <LogIn className="mr-1 h-3.5 w-3.5" /> Entrar
                    </>
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
