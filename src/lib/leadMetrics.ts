import type { QueryClient } from "@tanstack/react-query";

/**
 * Chaves de queries que dependem de dados de leads (status, estágio, valor).
 * Sempre que um lead for criado/atualizado/excluído, todas devem ser
 * invalidadas para o CRM inteiro (dashboard, funil, ranking, relatórios)
 * ficar coerente com o que o consultor salvou.
 */
const LEAD_DEPENDENT_KEYS = [
  "leads",
  "lead-search",
  "dashboard_metrics_v3",
  "team-funnel",
  "nav-badges",
  "conversations",
  "conversation-consultants",
  "response-rate-stats",
  "gamification_ranking",
  "gamification_member_summary",
  "gamification_team_overview",
  "gamification_executive_overview",
  "sales-profiles",
  "lead-distribution-today",
  "coaching_insights",
  "coaching_by_member",
  "nilton_leads_for_reports",
];

export function invalidateLeadMetrics(qc: QueryClient) {
  for (const key of LEAD_DEPENDENT_KEYS) {
    qc.invalidateQueries({ queryKey: [key] });
  }
}
