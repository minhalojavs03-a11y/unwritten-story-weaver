import { useAuth } from "@/contexts/AuthContext";
import { useActiveMember } from "@/contexts/ActiveMemberContext";

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

  const label = (member?.role_label ?? "").toLowerCase().trim();
  const memberIsOwner = !member || label === "dono" || label === "owner" || label === "proprietário" || label === "proprietario";
  const memberIsSupervisor = label === "supervisor" || label === "gerente" || label === "gestor";
  const memberIsConsultant = !!member && !memberIsOwner && !memberIsSupervisor;

  const hasSupervisorRole = (roles ?? []).includes("supervisor" as never);

  const effectiveIsOwner = isSuperadmin || (isOwner && memberIsOwner);

  // Supervisor é true quando:
  //  - não é owner efetivo, E
  //  - o membro ativo tem label de supervisão, OU
  //  - não há membro ativo (ou membro é genérico) e o role de auth é supervisor.
  const effectiveIsSupervisor = !effectiveIsOwner && (
    memberIsSupervisor ||
    (!memberIsConsultant && hasSupervisorRole)
  );

  return {
    isSuperadmin,
    isOwner: effectiveIsOwner,
    isSupervisor: effectiveIsSupervisor,
    activeMember: member,
  };
}
