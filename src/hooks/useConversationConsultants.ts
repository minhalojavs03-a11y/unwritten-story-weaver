import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveRole } from "@/hooks/useEffectiveRole";
import { isHiddenFeraconPerson, isHiddenFeraconUserId } from "@/lib/feracon";

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
    queryKey: ["conversation-consultants", "v3", tenantId, isSuperadmin, supervisorOnly],
    enabled: !!tenantId,
    queryFn: async (): Promise<ConsultantOption[]> => {
      // Sistema single-tenant Feracon: superadmin/owner/supervisor enxergam as
      // pessoas do mesmo tenant. Não há agregação por tenant.
      const [membershipsRes, profilesRes, membersRes, superRolesRes] = await Promise.all([
        supabase
          .from("tenant_memberships")
          .select("user_id, tenant_id, role, display_name, avatar_color, last_seen_at")
          .eq("tenant_id", tenantId!),
        supabase
          .from("profiles")
          .select("id, full_name, display_name, username, avatar_url, avatar_color, role_label, last_seen_at, tenant_id")
          .eq("tenant_id", tenantId!),
        supabase
          .from("tenant_members")
          .select("id, tenant_id, full_name, display_name, username, avatar_url, avatar_color, role_label, last_seen_at")
          .eq("is_active", true)
          .eq("tenant_id", tenantId!),
        supabase.rpc("get_superadmin_user_ids"),
      ]);
      if (membershipsRes.error) throw membershipsRes.error;
      if (profilesRes.error) throw profilesRes.error;
      if (membersRes.error) throw membersRes.error;
      if (superRolesRes.error) throw superRolesRes.error;

      // Ocultar superadmins sempre (Arley é invisível inclusive para ele mesmo nesta lista)
      const hiddenUserIds = new Set<string>(
        (superRolesRes.data ?? []).map((r) => r.user_id),
      );

      // Donos (owner) também são ocultados do dropdown — Ediane só é visível
      // para o próprio dono/superadmin nas conversas em si, não como filtro.
      const ownerUserIds = new Set<string>();
      const ownerNameKeys = new Set<string>();
      const _normName = (s?: string | null) =>
        String(s ?? "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, " ")
          .trim();
      for (const m of (membershipsRes.data ?? [])) {
        if (String(m.role || "").toLowerCase() === "owner") {
          ownerUserIds.add(m.user_id);
          const k = _normName(m.display_name);
          if (k) ownerNameKeys.add(k);
        }
      }

      const profilesById = new Map<string, ProfileOption>();
      for (const p of (profilesRes.data ?? []) as ProfileOption[]) {
        if (!isHiddenFeraconPerson(p as any)) profilesById.set(p.id, p);
        // Acumula chaves de nome do dono a partir do profile correspondente
        if (ownerUserIds.has(p.id)) {
          for (const cand of [p.full_name, p.display_name, p.username]) {
            const k = _normName(cand);
            if (k) ownerNameKeys.add(k);
          }
        }
      }


      const list: ConsultantOption[] = [];

      // ===== Owner/Supervisor: lista pessoas do próprio tenant =====
      const seen = new Set<string>();
      const seenNames = new Set<string>();
      const normName = (s?: string | null) =>
        String(s ?? "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, " ")
          .trim();
      const nameKey = (...candidates: (string | null | undefined)[]) => {
        for (const c of candidates) {
          const n = normName(c);
          if (n) return n;
        }
        return "";
      };

      for (const m of membershipsRes.data ?? []) {
        const role = String(m.role || "").toLowerCase();
        if (role === "owner" || role === "superadmin") continue;
        if (hiddenUserIds.has(m.user_id)) continue;
        if (supervisorOnly && role !== "consultant" && role !== "attendant") continue;
        if (seen.has(m.user_id)) continue;
        const p = profilesById.get(m.user_id);
        if (isHiddenFeraconUserId(m.user_id) || isHiddenFeraconPerson(p as any)) continue;
        const key = nameKey(m.display_name, p?.full_name, p?.display_name, p?.username);
        if (key && seenNames.has(key)) continue;
        seen.add(m.user_id);
        if (key) seenNames.add(key);
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
        if (isHiddenFeraconPerson(p as any)) continue;
        if (seen.has(p.id)) continue;
        if (hiddenUserIds.has(p.id)) continue;
        if (ownerUserIds.has(p.id)) continue;
        const label = (p.role_label || "").toLowerCase();
        if (label.includes("dono") || label.includes("owner") || label.includes("propriet")) continue;
        if (supervisorOnly && (label.includes("supervisor") || label.includes("gerente") || label.includes("gestor"))) continue;
        const key = nameKey(p.full_name, p.display_name, p.username);
        if (key && ownerNameKeys.has(key)) continue;
        if (key && seenNames.has(key)) continue;
        seen.add(p.id);
        if (key) seenNames.add(key);

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
        if (isHiddenFeraconPerson(tm as any)) continue;
        if (seen.has(tm.id)) continue;
        const label = (tm.role_label || "").toLowerCase();
        if (label.includes("dono") || label.includes("owner") || label.includes("propriet")) continue;
        if (supervisorOnly && (label.includes("supervisor") || label.includes("gerente") || label.includes("gestor"))) continue;
        const key = nameKey(tm.full_name, tm.display_name, tm.username);
        if (key && ownerNameKeys.has(key)) continue;
        if (key && seenNames.has(key)) continue;
        seen.add(tm.id);
        if (key) seenNames.add(key);

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

