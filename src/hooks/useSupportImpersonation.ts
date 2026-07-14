import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { AppRole } from "@/components/ui/RoleBadge";


export type SupportImpersonationContext = {
  tenant_id: string;
  tenant_name: string;
  previous_tenant_id: string | null;
  target_role?: AppRole | string | null;
  target_member_id?: string | null;
  target_user_id?: string | null;
  target_name?: string | null;
  target_email?: string | null;
};

const STORAGE_KEY = "impersonation_context";

function readContext(): SupportImpersonationContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SupportImpersonationContext) : null;
  } catch {
    return null;
  }
}

function normalizeRole(value?: string | null): AppRole | null {
  const role = (value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (!role) return null;
  if (role.includes("superadmin")) return "superadmin";
  if (["owner", "dono", "proprietario"].some((needle) => role.includes(needle))) return "owner";
  if (["supervisor", "gerente", "gestor"].some((needle) => role.includes(needle))) return "supervisor";
  if (["attendant", "atendente"].some((needle) => role.includes(needle))) return "attendant";
  if (["consultant", "consultor", "vendedor", "seller"].some((needle) => role.includes(needle))) return "consultant";
  return null;
}

export function useSupportImpersonation() {
  const { isSuperadmin, loading: authLoading } = useAuth();
  const [rawCtx, setRawCtx] = useState<SupportImpersonationContext | null>(() => readContext());

  useEffect(() => {
    const read = () => setRawCtx(readContext());
    window.addEventListener("storage", read);
    window.addEventListener("feracon:impersonation", read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("feracon:impersonation", read);
    };
  }, []);

  // Modo suporte só existe para superadmin. Se um contexto legado ficou no
  // localStorage de um usuário não-superadmin (ex.: dono logando depois),
  // ignoramos e limpamos — senão o dashboard fica preso no consultor alvo
  // e mostra tudo zerado para o dono/consultor real.
  useEffect(() => {
    if (authLoading) return;
    if (!isSuperadmin && rawCtx) {
      try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      setRawCtx(null);
      try { window.dispatchEvent(new Event("feracon:impersonation")); } catch { /* ignore */ }
    }
  }, [authLoading, isSuperadmin, rawCtx]);

  const ctx = isSuperadmin ? rawCtx : null;



  const roleQuery = useQuery({
    queryKey: ["support-impersonation-role", ctx?.tenant_id, ctx?.target_role ?? null],
    enabled: !!ctx?.tenant_id,
    queryFn: async (): Promise<AppRole | null> => {
      const storedRole = normalizeRole(ctx?.target_role as string | null | undefined);
      if (storedRole) return storedRole;

      const { data: tenant } = await supabase
        .from("tenants")
        .select("created_by")
        .eq("id", ctx!.tenant_id)
        .maybeSingle();

      const createdBy = (tenant as { created_by?: string | null } | null)?.created_by ?? null;
      if (createdBy) {
        const { data: membership } = await supabase
          .from("tenant_memberships")
          .select("role")
          .eq("tenant_id", ctx!.tenant_id)
          .eq("user_id", createdBy)
          .maybeSingle();
        const membershipRole = normalizeRole((membership as { role?: string | null } | null)?.role);
        if (membershipRole) return membershipRole;

        const { data: userRoles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", createdBy)
          .or(`tenant_id.eq.${ctx!.tenant_id},tenant_id.is.null`);
        const userRole = (userRoles ?? [])
          .map((item) => normalizeRole((item as { role?: string | null }).role))
          .find(Boolean) ?? null;
        if (userRole) return userRole;
      }

      const { data: memberships } = await supabase
        .from("tenant_memberships")
        .select("role")
        .eq("tenant_id", ctx!.tenant_id);
      const roles = (memberships ?? []).map((item) => normalizeRole((item as { role?: string | null }).role));
      return roles.find((role) => role === "owner")
        ?? roles.find((role) => role === "supervisor")
        ?? roles.find(Boolean)
        ?? null;
    },
  });

  return {
    context: ctx,
    isImpersonating: !!ctx,
    role: roleQuery.data ?? normalizeRole(ctx?.target_role as string | null | undefined),
    isLoadingRole: !!ctx && roleQuery.isLoading,
  };
}
