import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Conjunto de usuários/tenants com pelo menos uma instância WhatsApp conectada.
 * Usado para mostrar status "online no WhatsApp" ao lado do status do sistema.
 */
export function useWhatsAppOnline() {
  const { tenantId, isSuperadmin } = useAuth();
  return useQuery({
    queryKey: ["whatsapp-online", tenantId, isSuperadmin],
    enabled: !!tenantId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const base = supabase
        .from("whatsapp_instances")
        .select("seller_user_id, created_by_user_id, tenant_id, is_connected, status");
      const q = isSuperadmin ? base : base.eq("tenant_id", tenantId!);
      const { data, error } = await q;
      if (error) throw error;
      const userIds = new Set<string>();
      const tenantIds = new Set<string>();
      for (const inst of data ?? []) {
        const connected = inst.is_connected === true || inst.status === "connected";
        if (!connected) continue;
        if (inst.seller_user_id) userIds.add(inst.seller_user_id);
        if (inst.created_by_user_id) userIds.add(inst.created_by_user_id);
        if (inst.tenant_id) tenantIds.add(inst.tenant_id);
      }
      return { userIds, tenantIds };
    },
  });
}

export function isWhatsAppOnline(
  data: { userIds: Set<string>; tenantIds: Set<string> } | undefined,
  id: string,
) {
  if (!data) return false;
  if (id.startsWith("tenant:")) return data.tenantIds.has(id.slice("tenant:".length));
  return data.userIds.has(id);
}
