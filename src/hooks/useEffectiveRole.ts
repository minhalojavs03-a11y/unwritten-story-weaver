import { useAuth } from "@/contexts/AuthContext";
import { useActiveMember } from "@/contexts/ActiveMemberContext";
import { useSupportImpersonation } from "@/hooks/useSupportImpersonation";

/**
 * Permissão efetiva considerando o membro interno ativo.
 *
 * Regras:
 * - Superadmin sempre tem poderes de dono (atravessa qualquer tenant).
 * - Owner (auth) só mantém poderes de dono se o membro interno ativo for
 *   "Dono" (ou se nenhum membro estiver selecionado). Ao entrar como
 *   vendedor/consultor/supervisor/etc, NÃO deve ter acesso de dono.
 * - Supervisor (auth role) é tratado como supervisor quando não há membro
 *   ativo ou quando o membro ativo tem label compatível. Supervisor NÃO é
 *   owner — vê tudo do tenant mas não edita configurações sensíveis.
 */
export function useEffectiveRole() {
  const { isOwner, isSuperadmin, roles } = useAuth();
  const { member } = useActiveMember();
  const { isImpersonating, role: supportRole, isLoadingRole } = useSupportImpersonation();

  const label = (member?.role_label ?? "").toLowerCase().trim();
  const memberIsOwner = !member || label === "dono" || label === "owner" || label === "proprietário" || label === "proprietario";
  const memberIsSupervisor = label === "supervisor" || label === "gerente" || label === "gestor";
  const memberIsConsultant = !!member && !memberIsOwner && !memberIsSupervisor;

  const authIsSuperadmin = isSuperadmin && !isImpersonating;
  const authIsOwner = isOwner && !isImpersonating;
  const supportIsOwner = isImpersonating && supportRole === "owner";
  const supportIsSupervisor = isImpersonating && supportRole === "supervisor";
  const hasSupervisorRole = !isImpersonating && (roles ?? []).includes("supervisor" as never);

  const effectiveIsOwner = authIsSuperadmin || supportIsOwner || hasSupervisorRole || (authIsOwner && memberIsOwner) || supportIsSupervisor || memberIsSupervisor;

  // Supervisor é true quando:
  //  - não é owner efetivo, E
  //  - o membro ativo tem label de supervisão, OU
  //  - não há membro ativo (ou membro é genérico) e o role de auth é supervisor.
  const effectiveIsSupervisor = !effectiveIsOwner && (
    supportIsSupervisor ||
    memberIsSupervisor ||
    (!memberIsConsultant && hasSupervisorRole)
  );

  return {
    isSuperadmin: authIsSuperadmin,
    isOwner: effectiveIsOwner,
    isSupervisor: effectiveIsSupervisor,
    activeMember: member,
    isRoleLoading: isImpersonating && isLoadingRole && !supportRole,
  };
}
