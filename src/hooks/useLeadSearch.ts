import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveMember } from "@/contexts/ActiveMemberContext";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { usePermissions } from "@/hooks/usePermissions";
import type { Tables } from "@/integrations/supabase/types";

/**
 * Busca de leads direto no banco (server-side), sem depender da lista já
 * carregada em memória. Isso garante que clientes antigos (fora das últimas
 * 2000 linhas) também sejam encontrados por nome, telefone ou e-mail.
 */
export function useLeadSearch(term: string, opts?: { limit?: number }) {
  const raw = term.trim();
  const digits = raw.replace(/\D/g, "");
  const enabled = raw.length >= 2;

  const { can } = usePermissions();
  const canViewAll = can("view_all_leads");
  const { tenantId: authTenantId, isSuperadmin } = useAuth();
  const { member } = useActiveMember();
  const { user } = useAuth();
  const effective = useEffectiveUser();

  const tenantId = effective.isImpersonating ? effective.tenantId : authTenantId;
  const memberId = effective.isImpersonating ? effective.memberId : (member?.id ?? null);
  const userId = effective.isImpersonating ? effective.id : (user?.id ?? null);
  const scopeAll = canViewAll && !effective.isImpersonating;
  const limit = opts?.limit ?? 30;

  return useQuery({
    queryKey: ["lead-search", raw, scopeAll ? "all" : `${memberId ?? "-"}:${userId ?? "-"}`, tenantId ?? "global"],
    enabled,
    staleTime: 15_000,
    queryFn: async () => {
      const escaped = raw.replace(/[%,()]/g, " ").trim();
      const filters = [`name.ilike.%${escaped}%`, `email.ilike.%${escaped}%`];
      if (digits.length >= 3) filters.push(`phone.ilike.%${digits}%`);

      let query = supabase
        .from("leads")
        .select("id,name,phone,email,stage,status,created_at,assigned_member_id,assigned_to,tenant_id,source,kind")
        .or(filters.join(","))
        .order("created_at", { ascending: false })
        .limit(limit);

      if (tenantId && !(isSuperadmin && !effective.isImpersonating)) {
        query = query.eq("tenant_id", tenantId);
      }
      if (!scopeAll) {
        if (memberId && userId) query = query.or(`assigned_member_id.eq.${memberId},assigned_to.eq.${userId}`);
        else if (memberId) query = query.eq("assigned_member_id", memberId);
        else if (userId) query = query.eq("assigned_to", userId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Partial<Tables<"leads">>[];
    },
  });
}
