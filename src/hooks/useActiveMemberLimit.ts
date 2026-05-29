import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveMember } from "@/contexts/ActiveMemberContext";

/**
 * Retorna o teto de crédito (max_credit_value) do membro interno ativo.
 * Usado para limitar a visualização de leads por faixa de valor.
 */
export function useActiveMemberLimit() {
  const { member } = useActiveMember();
  const memberId = member?.id ?? null;

  const { data } = useQuery({
    queryKey: ["tenant_members.max_credit_value", memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_members")
        .select("max_credit_value")
        .eq("id", memberId!)
        .maybeSingle();
      if (error) throw error;
      return data?.max_credit_value ?? null;
    },
  });

  return { maxCreditValue: data ?? null, memberId };
}
