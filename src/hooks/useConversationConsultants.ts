import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveRole } from "@/hooks/useEffectiveRole";

export type ConsultantOption = {
  id: string; // id usado no filtro de conversas (user_id ou tenant_member.id)
  display_name: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  avatar_color: string | null;
  last_seen_at: string | null;
  role: string;
  role_label: string | null;
};

type ProfileOption = {
  id: string;
  full_name: string | null;
  display_name: string | null;
  username: string | null;
  email?: string | null;
  avatar_url: string | null;
  avatar_color: string | null;
  role_label: string | null;
  last_seen_at: string | null;
};

type TenantOption = { id: string; name: string | null };

const emptyResult = <T,>() => Promise.resolve({ data: [] as T[], error: null });

/**
 * Lista todos os atendentes/consultores/supervisores do tenant que aparecem
 * no dropdown de "Conversas por consultor". Combina três fontes:
 *  - tenant_memberships (consultores logados via e-mail)
 *  - profiles vinculados ao tenant (fallback)
 *  - tenant_members (sub-contas / PIN)
 * Exclui owner do dono e superadmin (eles são quem visualiza).
 */
export function useConversationConsultants() {
  const { tenantId, isSuperadmin } = useAuth();
  const { isOwner } = useEffectiveRole();
  // Supervisor = vê conversas mas não é dono/superadmin → restringe a consultores
  const supervisorOnly = !isOwner && !isSuperadmin;
  return useQuery({
    queryKey: ["conversation-consultants", tenantId, isSuperadmin, supervisorOnly],
    enabled: !!tenantId,
    queryFn: async (): Promise<ConsultantOption[]> => {
      // Superadmin enxerga todos os tenants → não filtra por tenant_id
      const membershipsQ = supabase
        .from("tenant_memberships")
        .select("user_id, tenant_id, role, display_name, avatar_color, last_seen_at");
      const profilesQ = supabase
        .from("profiles")
        .select("id, full_name, display_name, username, avatar_url, avatar_color, role_label, last_seen_at, tenant_id");
      const membersQ = supabase
        .from("tenant_members")
        .select("id, tenant_id, full_name, display_name, username, avatar_url, avatar_color, role_label, last_seen_at")
        .eq("is_active", true);

      const [membershipsRes, profilesRes, membersRes, tenantsRes, superRolesRes] = await Promise.all([
        isSuperadmin ? membershipsQ : membershipsQ.eq("tenant_id", tenantId!),
        isSuperadmin ? profilesQ : profilesQ.eq("tenant_id", tenantId!),
        isSuperadmin ? membersQ : membersQ.eq("tenant_id", tenantId!),
        isSuperadmin
          ? supabase.from("tenants").select("id, name").order("name")
          : emptyResult<TenantOption>(),
        isSuperadmin
          ? emptyResult<{ user_id: string }>()
          : supabase.from("user_roles").select("user_id").eq("role", "superadmin"),
      ]);
      if (membershipsRes.error) throw membershipsRes.error;
      if (profilesRes.error) throw profilesRes.error;
      if (membersRes.error) throw membersRes.error;
      if (tenantsRes.error) throw tenantsRes.error;
      if (superRolesRes.error) throw superRolesRes.error;

      // Ocultar superadmins quando o usuário atual não é superadmin
      const hiddenUserIds = new Set<string>(
        (superRolesRes.data ?? []).map((r) => r.user_id),
      );

      const profilesById = new Map<string, ProfileOption>();
      for (const p of (profilesRes.data ?? []) as ProfileOption[]) profilesById.set(p.id, p);

      const list: ConsultantOption[] = [];

      // ===== Superadmin: 1 entrada por tenant, com nome real da pessoa =====
      if (isSuperadmin) {
        const byTenant = new Map<string, {
          owner?: ProfileOption;
          supervisor?: ProfileOption;
          any?: ProfileOption;
          memberAvatarColor?: string | null;
          memberLastSeen?: string | null;
        }>();
        for (const m of membershipsRes.data ?? []) {
          const tid = (m as { tenant_id?: string }).tenant_id;
          if (!tid) continue;
          const role = String(m.role || "").toLowerCase();
          const p = profilesById.get(m.user_id);
          const bucket = byTenant.get(tid) ?? {};
          if (role === "supervisor" && p) bucket.supervisor = p;
          else if (role === "owner" && p) bucket.owner = p;
          else if (p) bucket.any = bucket.any ?? p;
          bucket.memberAvatarColor = bucket.memberAvatarColor ?? m.avatar_color ?? null;
          bucket.memberLastSeen = bucket.memberLastSeen ?? m.last_seen_at ?? null;
          byTenant.set(tid, bucket);
        }
        for (const p of (profilesRes.data ?? []) as (ProfileOption & { tenant_id?: string })[]) {
          const tid = p.tenant_id;
          if (!tid) continue;
          const bucket = byTenant.get(tid) ?? {};
          bucket.any = bucket.any ?? p;
          byTenant.set(tid, bucket);
        }

        for (const t of tenantsRes.data ?? []) {
          const bucket = byTenant.get(t.id);
          // Prioridade: supervisor → owner → qualquer profile → tenant.name
          const person = bucket?.supervisor ?? bucket?.owner ?? bucket?.any;
          const displayName =
            person?.full_name || person?.display_name || t.name || "Consultor";
          list.push({
            id: `tenant:${t.id}`,
            display_name: displayName,
            full_name: person?.full_name ?? null,
            username: person?.username ?? null,
            avatar_url: person?.avatar_url ?? null,
            avatar_color: person?.avatar_color ?? bucket?.memberAvatarColor ?? null,
            last_seen_at: person?.last_seen_at ?? bucket?.memberLastSeen ?? null,
            role: bucket?.supervisor ? "supervisor" : "tenant",
            role_label: person?.role_label ?? (bucket?.supervisor ? "Supervisor" : "Consultor"),
          });
        }

        list.sort((a, b) => a.display_name.localeCompare(b.display_name));
        return list;
      }

      // ===== Owner/Supervisor: lista pessoas do próprio tenant =====
      const seen = new Set<string>();

      for (const m of membershipsRes.data ?? []) {
        const role = String(m.role || "").toLowerCase();
        if (role === "owner" || role === "superadmin") continue;
        if (hiddenUserIds.has(m.user_id)) continue;
        if (supervisorOnly && role !== "consultant" && role !== "attendant") continue;
        if (seen.has(m.user_id)) continue;
        const p = profilesById.get(m.user_id);
        seen.add(m.user_id);
        list.push({
          id: m.user_id,
          display_name: m.display_name || p?.display_name || p?.full_name || p?.email || "Consultor",
          full_name: p?.full_name ?? null,
          username: p?.username ?? null,
          avatar_url: p?.avatar_url ?? null,
          avatar_color: m.avatar_color ?? p?.avatar_color ?? null,
          last_seen_at: m.last_seen_at ?? p?.last_seen_at ?? null,
          role,
          role_label: p?.role_label ?? null,
        });
      }

      for (const p of profilesRes.data ?? []) {
        if (seen.has(p.id)) continue;
        if (hiddenUserIds.has(p.id)) continue;
        const label = (p.role_label || "").toLowerCase();
        if (label.includes("dono") || label.includes("owner") || label.includes("propriet")) continue;
        if (supervisorOnly && (label.includes("supervisor") || label.includes("gerente") || label.includes("gestor"))) continue;
        seen.add(p.id);
        list.push({
          id: p.id,
          display_name: p.display_name || p.full_name || "Consultor",
          full_name: p.full_name ?? null,
          username: p.username ?? null,
          avatar_url: p.avatar_url ?? null,
          avatar_color: p.avatar_color ?? null,
          last_seen_at: p.last_seen_at ?? null,
          role: "consultant",
          role_label: p.role_label ?? null,
        });
      }

      for (const tm of membersRes.data ?? []) {
        if (seen.has(tm.id)) continue;
        const label = (tm.role_label || "").toLowerCase();
        if (label.includes("dono") || label.includes("owner") || label.includes("propriet")) continue;
        if (supervisorOnly && (label.includes("supervisor") || label.includes("gerente") || label.includes("gestor"))) continue;
        seen.add(tm.id);
        list.push({
          id: tm.id,
          display_name: tm.display_name || tm.full_name || "Consultor",
          full_name: tm.full_name ?? null,
          username: tm.username ?? null,
          avatar_url: tm.avatar_url ?? null,
          avatar_color: tm.avatar_color ?? null,
          last_seen_at: tm.last_seen_at ?? null,
          role: "consultant",
          role_label: tm.role_label ?? null,
        });
      }

      list.sort((a, b) => a.display_name.localeCompare(b.display_name));
      return list;
    },
  });
}

