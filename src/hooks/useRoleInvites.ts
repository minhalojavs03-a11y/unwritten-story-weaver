import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";

export type TenantRole = Database["public"]["Enums"]["tenant_role"];

export interface RoleInvite {
  id: string;
  tenant_id: string;
  role: TenantRole;
  role_label: string | null;
  token: string;
  is_active: boolean;
  expires_at: string | null;
  max_uses: number | null;
  uses_count: number;
  created_at: string;
}

export const ROLE_ORDER: TenantRole[] = ["owner", "supervisor", "consultant", "attendant"];

export const ROLE_LABELS: Record<TenantRole, string> = {
  owner: "Dono da Unidade",
  supervisor: "Supervisor",
  consultant: "Consultor",
  attendant: "Atendente",
};

export function buildRoleInviteLink(token: string) {
  return `${window.location.origin}/join/${token}`;
}

export function useRoleInvites() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["role-invites", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      // ensure rows exist
      await supabase.rpc("ensure_tenant_role_invites" as never);
      const { data, error } = await supabase
        .from("tenant_role_invites" as never)
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("role");
      if (error) throw error;
      const list = (data ?? []) as unknown as RoleInvite[];
      return ROLE_ORDER.map((r) => list.find((i) => i.role === r)).filter(Boolean) as RoleInvite[];
    },
  });

  const regenerate = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("regenerate_role_invite" as never, { _id: id } as never);
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["role-invites", tenantId] }),
  });

  const toggleActive = useMutation({
    mutationFn: async (input: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("tenant_role_invites" as never)
        .update({ is_active: input.is_active } as never)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["role-invites", tenantId] }),
  });

  return { ...query, regenerate, toggleActive };
}
