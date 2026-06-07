import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";

/**
 * Pílula compacta ao lado do sino de notificações que mostra o
 * status do WhatsApp em tempo real:
 *  - verde quando tudo conectado
 *  - vermelho quando há instância desconectada
 *
 * Para consultor: considera apenas a(s) instância(s) visível(is) por RLS
 * (em geral a dele). Para owner/supervisor/superadmin: considera todo o
 * tenant atual.
 */
export function WhatsAppStatusPill() {
  const { tenantId } = useAuth();
  const { can } = usePermissions();
  const privileged = can("assume_any_lead");

  const { data } = useQuery({
    queryKey: ["wa-status-pill", tenantId, privileged],
    enabled: !!tenantId,
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("is_connected,status")
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      let connected = 0;
      let total = 0;
      for (const r of data ?? []) {
        total++;
        if (r.is_connected === true || r.status === "connected") connected++;
      }
      return { connected, total };
    },
  });

  if (!data || data.total === 0) return null;
  const allOk = data.connected === data.total;
  const target = privileged ? "/equipe" : "/whatsapp";
  const label = privileged
    ? allOk
      ? `${data.connected}/${data.total}`
      : `${data.total - data.connected} off`
    : allOk
      ? "on"
      : "off";

  return (
    <Link
      to={target}
      title={
        allOk
          ? `WhatsApp: ${data.connected}/${data.total} conectado(s)`
          : `WhatsApp: ${data.total - data.connected} desconectado(s) de ${data.total}`
      }
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold transition ${
        allOk
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400"
          : "border-rose-500/30 bg-rose-500/10 text-rose-700 hover:bg-rose-500/15 dark:text-rose-400"
      }`}
    >
      <span
        className={`relative flex h-1.5 w-1.5 items-center justify-center`}
      >
        <span
          className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${
            allOk ? "bg-emerald-500" : "animate-ping bg-rose-500"
          }`}
        />
        <span
          className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
            allOk ? "bg-emerald-500" : "bg-rose-500"
          }`}
        />
      </span>
      <MessageCircle className="h-3 w-3" />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
