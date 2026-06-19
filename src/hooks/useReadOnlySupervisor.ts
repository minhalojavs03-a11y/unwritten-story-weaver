import { useEffectiveRole } from "@/hooks/useEffectiveRole";

/**
 * Retorna `true` quando o usuário é Supervisor "puro" — sem poderes de dono
 * nem de superadmin. Esses usuários NÃO podem alterar nada no sistema:
 * só visualizam dados e métricas. A única ação de escrita liberada é abrir
 * um pedido de atendimento de um lead marcado como perdido, que precisa
 * ser aprovado pelo consultor dono via notificação.
 */
export function useReadOnlySupervisor(): boolean {
  const { isSupervisor, isOwner, isSuperadmin } = useEffectiveRole();
  return isSupervisor && !isOwner && !isSuperadmin;
}
