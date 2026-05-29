import { useAuth } from "@/contexts/AuthContext";
import { useActiveMember } from "@/contexts/ActiveMemberContext";
import type { AppRole } from "@/components/ui/RoleBadge";

type Permission =
  | "view_all_leads"
  | "assume_any_lead"
  | "view_team_metrics"
  | "configure_sheets"
  | "manage_team"
  | "configure_whatsapp"
  | "view_financial"
  | "access_superadmin";

const MATRIX: Record<Permission, AppRole[]> = {
  view_all_leads:      ["superadmin", "owner", "supervisor"],
  assume_any_lead:     ["superadmin", "owner", "supervisor"],
  view_team_metrics:   ["superadmin", "owner", "supervisor"],
  configure_sheets:    ["superadmin", "owner"],
  manage_team:         ["superadmin", "owner"],
  configure_whatsapp:  ["superadmin", "owner", "supervisor"],
  view_financial:      ["superadmin", "owner"],
  access_superadmin:   ["superadmin"],
};

function getMemberRole(member: ReturnType<typeof useActiveMember>["member"]): AppRole | null {
  if (!member) return null;
  const value = `${member.role_label ?? ""} ${member.username ?? ""}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/(dono|owner|proprietario)/.test(value)) return "owner";
  if (/supervisor/.test(value)) return "supervisor";
  if (/(consultor|vendedor|seller)/.test(value)) return "consultant";
  if (/(atendente|attendant|menor|aprendiz|estagiario|trainee)/.test(value)) return "attendant";
  return "consultant";
}

export function usePermissions() {
  const { roles } = useAuth();
  const { member } = useActiveMember();
  const memberRole = getMemberRole(member);
  const effectiveRoles = memberRole ? [memberRole] : (roles as AppRole[]);
  const can = (p: Permission) => {
    const allowed = MATRIX[p] ?? [];
    return effectiveRoles.some((r) => allowed.includes(r));
  };
  return { can, roles: effectiveRoles };
}
