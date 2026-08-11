import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FERACON_TENANT_ID } from "@/lib/feracon";
import { stageLabels, stageOrder, type Stage } from "@/data/mock";
import type { SaleEntry } from "@/components/dashboard/ConsorcioFunnel";

export type TeamFunnelData = {
  funnel: { key: Stage; stage: string; count: number }[];
  lost: number;
  meetingsScheduled: number;
  lostReasons: { reason: string; count: number; pct: number }[];
  sales: SaleEntry[];
};

const EMPTY: TeamFunnelData = {
  funnel: stageOrder.filter((s) => s !== "perdido").map((s) => ({ key: s, stage: stageLabels[s], count: 0 })),
  lost: 0,
  meetingsScheduled: 0,
  lostReasons: [],
  sales: [],
};

const normalizeFunnelStage = (stage?: string | null): Stage | null => {
  const value = (stage ?? "").toLowerCase().trim();
  if (value === "atendimento") return "qualificado";
  if (["novo", "qualificado", "agendado", "compareceu", "comprou", "perdido"].includes(value)) {
    return value as Stage;
  }
  return null;
};

/**
 * Busca funil + vendas do TIME INTEIRO via RPC security definer.
 * Necessário para consultores, que via RLS enxergam apenas seus próprios leads.
 * O RPC nunca devolve telefone/e-mail dos leads.
 */
export function useTeamFunnel(
  tenantId: string | null | undefined,
  range: { start: Date | null; end: Date | null } | null,
) {
  const tenant = tenantId ?? FERACON_TENANT_ID;
  const start = range?.start ? range.start.toISOString() : null;
  const end = range?.end ? range.end.toISOString() : null;

  return useQuery({
    queryKey: ["team-funnel", tenant, start ?? "__all__", end ?? "__all__"],
    staleTime: 60_000,
    queryFn: async (): Promise<TeamFunnelData> => {
      const { data, error } = await supabase.rpc("get_team_funnel", {
        p_tenant_id: tenant,
        p_start: start ?? undefined,
        p_end: end ?? undefined,
      });
      if (error) throw error;
      const raw = (data ?? {}) as {
        funnel?: { stage: string; count: number }[];
        lost?: number;
        meetingsScheduled?: number;
        lostReasons?: { reason: string; count: number; pct: number }[];
        sales?: SaleEntry[];
      };
      const byStage = new Map<string, number>();
      (raw.funnel ?? []).forEach((r) => {
        const stage = normalizeFunnelStage(r.stage);
        if (!stage) return;
        byStage.set(stage, (byStage.get(stage) ?? 0) + (Number(r.count) || 0));
      });
      const funnel = stageOrder
        .filter((s) => s !== "perdido")
        .map((s) => ({ key: s as Stage, stage: stageLabels[s], count: byStage.get(s) ?? 0 }));
      return {
        funnel,
        lost: Number(raw.lost ?? 0),
        meetingsScheduled: Number(raw.meetingsScheduled ?? 0),
        lostReasons: (raw.lostReasons ?? []).map((r) => ({
          reason: r.reason,
          count: Number(r.count) || 0,
          pct: Number(r.pct) || 0,
        })),
        sales: (raw.sales ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          phone: "",
          value: Number(s.value) || 0,
          consultant: s.consultant,
          source: s.source,
          assetType: s.assetType ?? null,
          soldAt: s.soldAt ?? null,
        })),
      };
    },
    placeholderData: (prev) => prev ?? EMPTY,
  });
}
