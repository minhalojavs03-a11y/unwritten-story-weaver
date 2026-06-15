import { useAuth } from "@/contexts/AuthContext";
import { useActiveMember } from "@/contexts/ActiveMemberContext";
import { useSupportImpersonation } from "@/hooks/useSupportImpersonation";
import type { AppRole } from "@/components/ui/RoleBadge";

/**
 * Matriz de permissões oficial.
 *
 * Papéis:
 * - superadmin (Arley): acesso global, vê e edita tudo de qualquer tenant.
 * - owner / dono (Ediane no tenant dela): controle total do próprio tenant
 *   — configurações, equipe, IA, integrações, financeiro, WhatsApp.
 * - supervisor (Antonio no Feracon): vê conversas, leads e métricas de
 *   toda a equipe e faz coaching, mas NÃO edita configurações sensíveis
 *   (financeiro, IA, integrações, instâncias WhatsApp, gestão de equipe).
 * - consultant / attendant: só os próprios leads e conversas.
 */
type Permission =
  | "view_all_leads"
  | "assume_any_lead"
  | "transfer_lead"
  | "view_team_metrics"
  | "configure_sheets"
  | "manage_team"
  | "view_whatsapp"
  | "configure_whatsapp"
  | "configure_ai"
  | "configure_integrations"
  | "view_financial"
  | "access_superadmin";

const MATRIX: Record<Permission, AppRole[]> = {
  // Supervisor agora tem as MESMAS permissões de dono dentro do tenant
  view_all_leads:        ["superadmin", "owner", "supervisor"],
  assume_any_lead:       ["superadmin", "owner", "supervisor"],
  transfer_lead:         ["superadmin", "owner", "supervisor"],
  view_team_metrics:     ["superadmin", "owner", "supervisor"],
  view_whatsapp:         ["superadmin", "owner", "supervisor"],

  configure_sheets:      ["superadmin", "owner", "supervisor"],
  manage_team:           ["superadmin", "owner", "supervisor"],
  configure_whatsapp:    ["superadmin", "owner", "supervisor"],
  configure_ai:          ["superadmin", "owner", "supervisor"],
  configure_integrations:["superadmin", "owner", "supervisor"],
  view_financial:        ["superadmin", "owner", "supervisor"],

  access_superadmin:     ["superadmin"],
};

function getMemberRole(member: ReturnType<typeof useActiveMember>["member"]): AppRole | null {
  if (!member) return null;
  const value = `${member.role_label ?? ""} ${member.username ?? ""}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/(dono|owner|proprietario)/.test(value)) return "owner";
  if (/(supervisor|gerente|gestor)/.test(value)) return "supervisor";
  if (/(consultor|vendedor|seller)/.test(value)) return "consultant";
  if (/(atendente|attendant|menor|aprendiz|estagiario|trainee)/.test(value)) return "attendant";
  return "consultant";
}

export function usePermissions() {
  const { roles } = useAuth();
  const { member } = useActiveMember();
  const { role: supportRole } = useSupportImpersonation();
  const memberRole = getMemberRole(member);
  const authRoles = roles as AppRole[];
  const authIsSupervisor = authRoles.includes("supervisor");
  const authIsSuperadmin = authRoles.includes("superadmin");
  const effectiveRoles = supportRole
    ? [supportRole]
    : (authIsSuperadmin || authIsSupervisor)
      ? authRoles
      : memberRole
        ? [memberRole]
        : authRoles;
  const can = (p: Permission) => {
    const allowed = MATRIX[p] ?? [];
    return effectiveRoles.some((r) => allowed.includes(r));
  };
  return { can, roles: effectiveRoles };
}
