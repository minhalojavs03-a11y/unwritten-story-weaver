import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveMember } from "@/contexts/ActiveMemberContext";
import { useSupportImpersonation } from "@/hooks/useSupportImpersonation";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/components/ui/RoleBadge";

type MemberIdentity = {
  user_id: string | null;
  email: string | null;
  display_name: string | null;
  username: string | null;
  role_label: string | null;
  tenant_id: string | null;
};

export function useEffectiveUser() {
  const { user, tenantId: authTenantId } = useAuth();
  const { member } = useActiveMember();
  const { context, isImpersonating, role } = useSupportImpersonation();

  const targetMemberId = context?.target_member_id ?? (isImpersonating ? null : member?.id ?? null);
  const storedTargetUserId = context?.target_user_id ?? null;

  const memberQuery = useQuery({
    queryKey: ["effective-user-member", targetMemberId],
    enabled: !!targetMemberId && (!storedTargetUserId || isImpersonating),
    staleTime: 60_000,
    queryFn: async (): Promise<MemberIdentity | null> => {
      const { data, error } = await supabase
        .from("tenant_members")
        .select("user_id,email,display_name,username,role_label,tenant_id")
        .eq("id", targetMemberId!)
        .maybeSingle();
      if (error) throw error;
      return (data as MemberIdentity | null) ?? null;
    },
  });

  return useMemo(() => {
    const resolvedMember = memberQuery.data ?? null;
    const targetUserId = storedTargetUserId ?? resolvedMember?.user_id ?? null;
    const targetRole = (context?.target_role as AppRole | null | undefined) ?? role ?? null;
    const supportTenantId = context?.tenant_id ?? resolvedMember?.tenant_id ?? null;
    return {
      id: isImpersonating ? targetUserId : (user?.id ?? null),
      role: isImpersonating ? targetRole : null,
      isImpersonating,
      realAdminId: user?.id ?? null,
      memberId: targetMemberId ?? null,
      tenantId: isImpersonating ? supportTenantId : authTenantId,
      name: context?.target_name ?? context?.tenant_name ?? resolvedMember?.display_name ?? member?.display_name ?? null,
      email: context?.target_email ?? resolvedMember?.email ?? null,
      isLoading: isImpersonating && !!targetMemberId && !targetUserId && memberQuery.isLoading,
    };
  }, [authTenantId, context, isImpersonating, member, memberQuery.data, memberQuery.isLoading, role, storedTargetUserId, targetMemberId, user?.id]);
}