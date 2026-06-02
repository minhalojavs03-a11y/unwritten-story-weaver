import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables } from "@/integrations/supabase/types";

export type Profile = Tables<"profiles">;
export type TeamRole = "owner" | "supervisor" | "consultant" | "attendant";
export type AppRoleAll = TeamRole | "superadmin";

// Mantém a mesma forma que TeamMemberCard consome.
export type TeamMember = {
  id: string;
  // origem: tenant_members ou profile vinculado
  source: "tenant_member" | "profile";
  tenant_id: string | null;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  username: string | null;
  role_label: string | null;
  avatar_url: string | null;
  avatar_color: string;
  last_seen_at: string | null;
  monthly_goal: number;
  roles: AppRoleAll[];
  primary_role: AppRoleAll;
  leads_count: number;
};

const ROLE_PRIORITY: AppRoleAll[] = ["superadmin", "owner", "supervisor", "consultant", "attendant"];

function pickPrimary(roles: AppRoleAll[]): AppRoleAll {
  for (const r of ROLE_PRIORITY) if (roles.includes(r)) return r;
  return "attendant";
}

// Mapeia o role_label livre para o app_role usado no badge visual
function inferRoleFromLabel(label?: string | null): AppRoleAll {
  const l = (label ?? "").toLowerCase().trim();
  if (!l) return "consultant";
  if (l.includes("dono") || l.includes("owner") || l.includes("propriet")) return "owner";
  if (l.includes("supervisor") || l.includes("gerente") || l.includes("gestor")) return "supervisor";
  if (l.includes("vendedor") || l.includes("consultor") || l.includes("aprendiz")) return "consultant";
  return "consultant";
}

export function useTeam() {
  const { tenantId, isSuperadmin } = useAuth();
  return useQuery({
    queryKey: ["team", tenantId, isSuperadmin],
    enabled: !!tenantId,
    queryFn: async (): Promise<TeamMember[]> => {
      const [membersRes, profilesRes, rolesRes, leadsRes, superRolesRes] = await Promise.all([
        supabase
          .from("tenant_members")
          .select("*")
          .eq("tenant_id", tenantId!)
          .eq("is_active", true),
        supabase.from("profiles").select("*").eq("tenant_id", tenantId!),
        supabase.from("user_roles").select("user_id, role").eq("tenant_id", tenantId!),
        supabase
          .from("leads")
          .select("assigned_member_id, assigned_to")
          .eq("tenant_id", tenantId!),
        isSuperadmin
          ? Promise.resolve({ data: [] as { user_id: string }[], error: null })
          : supabase.from("user_roles").select("user_id").eq("role", "superadmin"),
      ]);
      if (membersRes.error) throw membersRes.error;
      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;
      if (leadsRes.error) throw leadsRes.error;
      if (superRolesRes.error) throw superRolesRes.error;

      const hiddenUserIds = new Set<string>(
        (superRolesRes.data ?? []).map((r) => r.user_id),
      );

      const rolesByUser = new Map<string, AppRoleAll[]>();
      for (const row of rolesRes.data ?? []) {
        const arr = rolesByUser.get(row.user_id) ?? [];
        arr.push(row.role as AppRoleAll);
        rolesByUser.set(row.user_id, arr);
      }

      // Conta leads tanto por assigned_member_id (fonte nova) quanto por assigned_to (legado)
      const leadsByMember = new Map<string, number>();
      const leadsByUser = new Map<string, number>();
      for (const row of leadsRes.data ?? []) {
        if (row.assigned_member_id) {
          leadsByMember.set(row.assigned_member_id, (leadsByMember.get(row.assigned_member_id) ?? 0) + 1);
        }
        if (row.assigned_to) {
          leadsByUser.set(row.assigned_to, (leadsByUser.get(row.assigned_to) ?? 0) + 1);
        }
      }

      const profilesByEmail = new Map<string, Profile>();
      for (const p of profilesRes.data ?? []) {
        if (p.email) profilesByEmail.set(p.email.toLowerCase(), p as Profile);
      }
      const usedProfileIds = new Set<string>();

      // 1) Membros internos (tenant_members) — fonte de verdade da equipe
      const fromMembers: TeamMember[] = (membersRes.data ?? []).map((m) => {
        const linkedProfile = m.email ? profilesByEmail.get(m.email.toLowerCase()) : undefined;
        if (linkedProfile) usedProfileIds.add(linkedProfile.id);

        const userRoles = linkedProfile ? rolesByUser.get(linkedProfile.id) ?? [] : [];
        const inferred = inferRoleFromLabel(m.role_label);
        const roles: AppRoleAll[] = userRoles.length ? userRoles : [inferred];

        const leadsCount =
          (leadsByMember.get(m.id) ?? 0) +
          (linkedProfile ? leadsByUser.get(linkedProfile.id) ?? 0 : 0);

        return {
          id: m.id,
          source: "tenant_member",
          tenant_id: m.tenant_id,
          email: m.email ?? linkedProfile?.email ?? null,
          full_name: m.full_name ?? linkedProfile?.full_name ?? null,
          display_name: m.display_name ?? linkedProfile?.display_name ?? null,
          username: m.username ?? linkedProfile?.username ?? null,
          role_label: m.role_label ?? linkedProfile?.role_label ?? null,
          // IMPORTANTE: nunca herdar avatar do profile vinculado por e-mail
          // (vários membros podem compartilhar e-mail e acabariam mostrando
          // a foto/cor do dono). Cada membro só exibe sua própria identidade.
          avatar_url: m.avatar_url ?? null,
          avatar_color: m.avatar_color ?? "#1E40AF",
          last_seen_at: m.last_seen_at ?? linkedProfile?.last_seen_at ?? null,
          monthly_goal: m.monthly_goal ?? linkedProfile?.monthly_goal ?? 0,
          roles,
          primary_role: pickPrimary(roles),
          leads_count: leadsCount,
        };
      });

      // 2) Profiles que não têm tenant_member equivalente (ex: dono com login por email)
      const fromProfiles: TeamMember[] = (profilesRes.data ?? [])
        .filter((p) => !usedProfileIds.has(p.id))
        .map((p) => {
          const userRoles = rolesByUser.get(p.id) ?? [];
          const inferred = inferRoleFromLabel(p.role_label);
          const roles: AppRoleAll[] = userRoles.length ? userRoles : [inferred];
          return {
            id: p.id,
            source: "profile",
            tenant_id: p.tenant_id,
            email: p.email,
            full_name: p.full_name,
            display_name: p.display_name,
            username: p.username,
            role_label: p.role_label,
            avatar_url: p.avatar_url,
            avatar_color: p.avatar_color ?? "#1E40AF",
            last_seen_at: p.last_seen_at,
            monthly_goal: p.monthly_goal ?? 0,
            roles,
            primary_role: pickPrimary(roles),
            leads_count: leadsByUser.get(p.id) ?? 0,
          };
        });

      const all = [...fromMembers, ...fromProfiles];
      all.sort((a, b) => {
        const ra = ROLE_PRIORITY.indexOf(a.primary_role);
        const rb = ROLE_PRIORITY.indexOf(b.primary_role);
        if (ra !== rb) return ra - rb;
        return (a.display_name ?? "").localeCompare(b.display_name ?? "");
      });
      return all;
    },
  });
}

export function useUpdateMemberRole() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: TeamRole }) => {
      if (!tenantId) throw new Error("sem tenant");
      const { error: delErr } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("tenant_id", tenantId)
        .neq("role", "superadmin");
      if (delErr) throw delErr;
      const { error: insErr } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role, tenant_id: tenantId });
      if (insErr) throw insErr;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team", tenantId] }),
  });
}

export function useUpdateMemberProfile() {
  const qc = useQueryClient();
  const { tenantId } = useAuth();
  return useMutation({
    mutationFn: async ({ userId, role_label, monthly_goal }: { userId: string; role_label?: string; monthly_goal?: number }) => {
      const patch: { role_label?: string | null; monthly_goal?: number } = {};
      if (role_label !== undefined) patch.role_label = role_label || null;
      if (monthly_goal !== undefined) patch.monthly_goal = monthly_goal;
      const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team", tenantId] }),
  });
}
