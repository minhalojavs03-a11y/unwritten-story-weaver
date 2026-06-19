import { useAuth } from "@/contexts/AuthContext";
import { useActiveMember } from "@/contexts/ActiveMemberContext";

export function maskPhone(phone?: string | null): string {
  if (!phone) return "—";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 2) return "•••••";
  return `••••• ${digits.slice(-2)}`;
}

type LeadLike = {
  assigned_to?: string | null;
  assigned_member_id?: string | null;
} | null | undefined;

/**
 * Hook: retorna função que decide se o usuário atual pode ver o telefone real do lead.
 * Regras:
 *  - Superadmin sempre vê.
 *  - Dono (Ediane / role_label "dono") sempre vê.
 *  - Consultor/Supervisor só vê se o lead estiver atribuído a ele.
 */
export function useCanViewLeadPhone() {
  const { isSuperadmin, roles, user } = useAuth();
  const { member } = useActiveMember();

  const label = (member?.role_label ?? "").toLowerCase().trim();
  const memberIsOwner = label === "dono" || label === "owner" || label === "proprietário" || label === "proprietario";
  const hasSupervisorRole = (roles ?? []).includes("supervisor" as never);
  // "Dono estrito": superadmin OU membro ativo é Dono OU (não há membro ativo, role owner em auth, e NÃO é supervisor).
  const authIsOwnerStrict = !member && (roles ?? []).includes("owner" as never) && !hasSupervisorRole;
  const isOwnerStrict = isSuperadmin || memberIsOwner || authIsOwnerStrict;

  return (lead: LeadLike): boolean => {
    if (isOwnerStrict) return true;
    if (!lead) return false;
    if (member?.id && lead.assigned_member_id && lead.assigned_member_id === member.id) return true;
    if (user?.id && lead.assigned_to && lead.assigned_to === user.id) return true;
    return false;
  };
}

export function displayPhone(phone: string | null | undefined, allowed: boolean): string {
  if (!phone) return "—";
  return allowed ? phone : maskPhone(phone);
}
