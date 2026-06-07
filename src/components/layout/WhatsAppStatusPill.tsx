import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Pílula compacta ao lado do sino de notificações: status do WhatsApp
 * do PRÓPRIO usuário logado (verde = conectado, vermelho = desconectado).
 * A notificação serve apenas para avisar sobre o próprio perfil — não
 * agrega status da equipe.
 */
export function WhatsAppStatusPill() {
  const { tenantId, user } = useAuth();

  const { data } = useQuery({
    queryKey: ["wa-status-pill", tenantId, user?.id],
    enabled: !!tenantId && !!user?.id,
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async () => {
      // Busca instâncias deste usuário neste tenant. Usa OR para cobrir tanto
      // seller_user_id quanto created_by_user_id (algumas instâncias antigas só
      // têm created_by).
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("is_connected,status,seller_user_id,created_by_user_id")
        .eq("tenant_id", tenantId!)
        .or(`seller_user_id.eq.${user!.id},created_by_user_id.eq.${user!.id}`);
      if (error) throw error;
      if (!data || data.length === 0) return null;
      const connected = data.some(
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
      title={ok ? "Seu WhatsApp está conectado" : "Seu WhatsApp está desconectado"}
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
