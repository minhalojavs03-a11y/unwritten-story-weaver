import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables } from "@/integrations/supabase/types";
import type { TeamRole } from "./useTeam";

export type Invite = Tables<"team_invites">;

export function useInvites() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ["invites", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_invites")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Invite[];
    },
  });
}

export function useCreateInvite() {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; role: TeamRole; role_label?: string; display_name?: string }) => {
      if (!tenantId) throw new Error("sem tenant");
      const email = input.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("e-mail inválido");

      const { data, error } = await supabase
        .from("team_invites")
        .insert({
          tenant_id: tenantId,
          email,
          role: input.role,
          role_label: input.role_label?.trim() || null,
          display_name: input.display_name?.trim() || null,
          invited_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Invite;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invites", tenantId] }),
  });
}

export function useRevokeInvite() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("team_invites")
        .update({ status: "revoked" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invites", tenantId] }),
  });
}

export function useResendInvite() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from("team_invites")
        .update({ status: "pending", expires_at: newExpiry })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invites", tenantId] }),
  });
}

export function buildInviteLink(token: string) {
  const base = import.meta.env.VITE_APP_DOMAIN || window.location.origin;
  return `${base}/login?invite=${token}`;
}
