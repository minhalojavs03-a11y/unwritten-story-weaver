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

      const [membershipsRes, profilesRes, membersRes, tenantsRes] = await Promise.all([
        isSuperadmin ? membershipsQ : membershipsQ.eq("tenant_id", tenantId!),
        isSuperadmin ? profilesQ : profilesQ.eq("tenant_id", tenantId!),
        isSuperadmin ? membersQ : membersQ.eq("tenant_id", tenantId!),
        isSuperadmin
          ? supabase.from("tenants").select("id, name").order("name")
          : emptyResult<TenantOption>(),
      ]);
      if (membershipsRes.error) throw membershipsRes.error;
      if (profilesRes.error) throw profilesRes.error;
      if (membersRes.error) throw membersRes.error;
      if (tenantsRes.error) throw tenantsRes.error;

      const profilesById = new Map<string, ProfileOption>();
      for (const p of (profilesRes.data ?? []) as ProfileOption[]) profilesById.set(p.id, p);

      // Mapa tenant_id → user_ids que já têm profile/membership (para evitar
      // duplicar a opção "tenant:" quando já existe alguém real cadastrado).
      const tenantsCovered = new Set<string>();
      for (const p of profilesRes.data ?? []) if (p.tenant_id) tenantsCovered.add(p.tenant_id);
      for (const m of membershipsRes.data ?? []) if ((m as { tenant_id?: string }).tenant_id) tenantsCovered.add((m as { tenant_id: string }).tenant_id);
      for (const tm of membersRes.data ?? []) if ((tm as { tenant_id?: string }).tenant_id) tenantsCovered.add((tm as { tenant_id: string }).tenant_id);


      const seen = new Set<string>();
      const list: ConsultantOption[] = [];

      // 1) memberships (fonte oficial de roles por tenant)
      for (const m of membershipsRes.data ?? []) {
        const role = String(m.role || "").toLowerCase();
        if (role === "owner" || role === "superadmin") continue;
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

      // 2) profiles do tenant que não estão nas memberships (fallback)
      for (const p of profilesRes.data ?? []) {
        if (seen.has(p.id)) continue;
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

      // 3) tenant_members (sub-contas/PIN)
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

      // 4) Superadmin: neste projeto cada consultor pode existir como um tenant
      // separado. Mostra todos para permitir filtrar conversas mesmo sem histórico.
      for (const t of tenantsRes.data ?? []) {
        const optionId = `tenant:${t.id}`;
        if (seen.has(optionId)) continue;
        seen.add(optionId);
        list.push({
          id: optionId,
          display_name: t.name || "Consultor",
          full_name: null,
          username: null,
          avatar_url: null,
          avatar_color: null,
          last_seen_at: null,
          role: "tenant",
          role_label: "Consultor",
        });
      }

      list.sort((a, b) => a.display_name.localeCompare(b.display_name));
      return list;
    },
  });
}
