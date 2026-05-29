import { useAuth } from "@/contexts/AuthContext";
import { useActiveMember } from "@/contexts/ActiveMemberContext";

/**
 * Permissão efetiva considerando o membro interno ativo.
 * Mesmo que o usuário Supabase seja owner, se ele entrou como
 * vendedor/consultor/supervisor/etc, ele NÃO deve ter acesso de dono.
 * Apenas "Dono" (ou nenhum membro selecionado) mantém poderes de owner.
 */
export function useEffectiveRole() {
  const { isOwner, isSuperadmin } = useAuth();
  const { member } = useActiveMember();

  const label = (member?.role_label ?? "").toLowerCase().trim();
  const memberIsOwner = !member || label === "dono" || label === "owner" || label === "proprietário" || label === "proprietario";

  return {
    isSuperadmin,
    isOwner: isOwner && memberIsOwner,
    activeMember: member,
  };
}
