import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveMember } from "@/contexts/ActiveMemberContext";
import { usePermissions } from "@/hooks/usePermissions";

/**
 * Contagens em tempo real para os badges do bottom-nav mobile.
 * - conversas: total de conversas com unread_count > 0 no escopo do usuário
 * - fila: total de leads na fila (ativos) no escopo do usuário
 */
export function useNavBadges() {
  const { tenantId, user } = useAuth();
  const { member } = useActiveMember();
  const { can } = usePermissions();
  const privileged = can("assume_any_lead");
  const memberId = member?.id ?? null;
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();

  const enabled = !!tenantId && (privileged || !!memberId || !!userId);
  const queryKey = ["nav-badges", tenantId, privileged ? "all" : (memberId ?? `u:${userId}`)];

  const { data } = useQuery({
    enabled,
    queryKey,
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Conversas com mensagens não lidas — sempre exclui "outros" via inner join.
      let convQuery;
      if (privileged) {
        convQuery = supabase
          .from("conversations")
          .select("id, lead:leads!inner(kind)", { count: "exact", head: true })
          .eq("tenant_id", tenantId!)
          .eq("lead.kind", "lead")
          .gt("unread_count", 0);
      } else if (memberId) {
        convQuery = supabase
          .from("conversations")
          .select("id, lead:leads!inner(assigned_member_id,kind)", { count: "exact", head: true })
          .eq("tenant_id", tenantId!)
          .eq("lead.assigned_member_id", memberId)
          .eq("lead.kind", "lead")
          .gt("unread_count", 0);
      } else {
        convQuery = supabase
          .from("conversations")
          .select("id, lead:leads!inner(assigned_to,kind)", { count: "exact", head: true })
          .eq("tenant_id", tenantId!)
          .eq("lead.assigned_to", userId!)
          .eq("lead.kind", "lead")
          .gt("unread_count", 0);
      }

      // Leads na fila (ativos) — exclui "outros".
      let filaQuery = supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId!)
        .eq("kind", "lead")
        .not("stage", "in", "(perdido,comprou,historico)");
      if (!privileged) {
        if (memberId) filaQuery = filaQuery.eq("assigned_member_id", memberId);
        else filaQuery = filaQuery.eq("assigned_to", userId!);
      }


      const [{ count: convCount }, { count: filaCount }] = await Promise.all([
        convQuery,
        filaQuery,
      ]);

      return {
        conversas: convCount ?? 0,
        fila: filaCount ?? 0,
      };
    },
  });

  // Realtime: invalida ao detectar mudanças relevantes
  useEffect(() => {
    if (!enabled) return;
    const suffix = Math.random().toString(36).slice(2, 8);
    const ch = supabase
      .channel(`nav-badges-${tenantId}-${memberId ?? "all"}-${suffix}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations", filter: `tenant_id=eq.${tenantId}` },
        () => queryClient.invalidateQueries({ queryKey })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads", filter: `tenant_id=eq.${tenantId}` },
        () => queryClient.invalidateQueries({ queryKey })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tenantId, memberId, privileged]);

  return {
    conversas: data?.conversas ?? 0,
    fila: data?.fila ?? 0,
  };
}
