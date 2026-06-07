import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveMember } from "@/contexts/ActiveMemberContext";
import { useSupportImpersonation } from "@/hooks/useSupportImpersonation";

/**
 * Pílula compacta ao lado do sino: status do WhatsApp do perfil ATIVO
 * (membro selecionado / impersonado). Verde = conectado, vermelho = off.
 * Notificação serve apenas para o próprio perfil ativo — não agrega equipe.
 */
export function WhatsAppStatusPill() {
  const { tenantId, user } = useAuth();
  const { member } = useActiveMember();
  const { context: supportContext } = useSupportImpersonation();

  const targetMemberId = supportContext?.target_member_id ?? member?.id ?? null;
  const targetTenantId = supportContext?.tenant_id ?? tenantId ?? null;

  const { data } = useQuery({
    queryKey: ["wa-status-pill", targetTenantId, targetMemberId, user?.id],
    enabled: !!targetTenantId && (!!targetMemberId || !!user?.id),
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async () => {
      // 1) Resolve o user_id do perfil ativo. Se um tenant_member está
      //    selecionado (caso normal e também em modo suporte/impersonação),
      //    usamos o user_id desse membro — não o do usuário logado real.
      let targetUserId: string | null = null;
      if (targetMemberId) {
        const { data: tm } = await supabase
          .from("tenant_members")
          .select("user_id")
          .eq("id", targetMemberId)
          .maybeSingle();
        targetUserId = (tm as { user_id?: string | null } | null)?.user_id ?? null;
      }
      if (!targetUserId) targetUserId = user?.id ?? null;
      if (!targetUserId) return null;

      const { data: rows, error } = await supabase
        .from("whatsapp_instances")
        .select("is_connected,status")
        .eq("tenant_id", targetTenantId!)
        .or(`seller_user_id.eq.${targetUserId},created_by_user_id.eq.${targetUserId}`);
      if (error) throw error;
      if (!rows || rows.length === 0) return null;
      const connected = rows.some(
        (r) => r.is_connected === true || r.status === "connected",
      );
      return { connected };
    },
  });

  if (!data) return null;
  const ok = data.connected;

  return (
    <Link
      to="/whatsapp"
      title={ok ? "WhatsApp conectado" : "WhatsApp desconectado"}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold transition ${
        ok
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400"
          : "border-rose-500/30 bg-rose-500/10 text-rose-700 hover:bg-rose-500/15 dark:text-rose-400"
      }`}
    >
      <span className="relative flex h-1.5 w-1.5 items-center justify-center">
        <span
          className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${
            ok ? "bg-emerald-500" : "animate-ping bg-rose-500"
          }`}
        />
        <span
          className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
            ok ? "bg-emerald-500" : "bg-rose-500"
          }`}
        />
      </span>
      <MessageCircle className="h-3 w-3" />
      <span className="hidden sm:inline">{ok ? "on" : "off"}</span>
    </Link>
  );
}
