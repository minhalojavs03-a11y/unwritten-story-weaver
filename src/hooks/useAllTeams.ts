import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type AppRoleAll = "superadmin" | "owner" | "supervisor" | "consultant" | "attendant";

export interface TenantTeamSummary {
  tenant: Tables<"tenants">;
  members: (Tables<"profiles"> & { roles: AppRoleAll[]; primary_role: AppRoleAll })[];
  owner_profile: Tables<"profiles"> | null;
  member_count: number;
  owners: number;
  supervisors: number;
  consultants: number;
  attendants: number;
  pending_invites: number;
}

const PRIORITY: AppRoleAll[] = ["superadmin", "owner", "supervisor", "consultant", "attendant"];
function pickPrimary(roles: AppRoleAll[]): AppRoleAll {
  for (const r of PRIORITY) if (roles.includes(r)) return r;
  return "attendant";
}

export function useAllTeams() {
  return useQuery({
    queryKey: ["admin-all-teams"],
    queryFn: async (): Promise<TenantTeamSummary[]> => {
      const [tenantsRes, profilesRes, rolesRes, invitesRes] = await Promise.all([
        supabase.from("tenants").select("*").order("name"),
        supabase.from("profiles").select("*"),
        supabase.from("user_roles").select("user_id, role, tenant_id"),
        supabase.from("team_invites").select("tenant_id, status"),
      ]);
      if (tenantsRes.error) throw tenantsRes.error;
      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;
      if (invitesRes.error) throw invitesRes.error;

      const rolesByUser = new Map<string, AppRoleAll[]>();
      for (const r of rolesRes.data ?? []) {
        const arr = rolesByUser.get(r.user_id) ?? [];
        arr.push(r.role as AppRoleAll);
        rolesByUser.set(r.user_id, arr);
      }

      const invitesByTenant = new Map<string, number>();
      for (const i of invitesRes.data ?? []) {
        if (i.status !== "pending" || !i.tenant_id) continue;
        invitesByTenant.set(i.tenant_id, (invitesByTenant.get(i.tenant_id) ?? 0) + 1);
      }

      return (tenantsRes.data ?? []).map((tenant) => {
        const tenantProfiles = (profilesRes.data ?? []).filter((p) => p.tenant_id === tenant.id);
        const members = tenantProfiles.map((p) => {
          const roles = rolesByUser.get(p.id) ?? [];
          return { ...(p as Tables<"profiles">), roles, primary_role: pickPrimary(roles) };
        });
        const ownerMember = members.find((m) => m.primary_role === "owner") ?? null;
        const ownerByCreator = tenant.created_by
          ? (profilesRes.data ?? []).find((p) => p.id === tenant.created_by) ?? null
          : null;
        return {
          tenant: tenant as Tables<"tenants">,
          members,
          owner_profile: (ownerMember ?? ownerByCreator) as Tables<"profiles"> | null,
          member_count: members.length,
          owners: members.filter((m) => m.primary_role === "owner").length,
          supervisors: members.filter((m) => m.primary_role === "supervisor").length,
          consultants: members.filter((m) => m.primary_role === "consultant").length,
          attendants: members.filter((m) => m.primary_role === "attendant").length,
          pending_invites: invitesByTenant.get(tenant.id) ?? 0,
        };
      });
    },
  });
}
