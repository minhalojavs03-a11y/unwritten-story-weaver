import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveMember } from "@/contexts/ActiveMemberContext";
import { isHiddenFeraconPerson } from "@/lib/feracon";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";

export type Period = "daily" | "weekly" | "monthly" | "all";

export interface RankingRow {
  member_id: string;
  display_name: string;
  avatar_color: string | null;
  avatar_url: string | null;
  role_label: string | null;
  points: number;
  sales: number;
  meetings: number;
  contacts: number;
  leads_assumed: number;
}

export interface MemberSummary {
  points: number;
  sales: number;
  meetings: number;
  contacts: number;
  leads_assumed: number;
  fast_responses: number;
  rank_position: number;
  total_members: number;
}

export interface TeamRow extends RankingRow {
  last_seen_at: string | null;
  active_leads: number;
  stalled_leads: number;
}

export interface ExecutiveOverview {
  totals: {
    sales: number;
    meetings: number;
    contacts: number;
    leads_assumed: number;
    points: number;
    leads_total: number;
  };
  estimated_revenue: number;
  conversion_rate: number;
  timeseries: Array<{ day: string; sales: number; meetings: number; points: number }>;
  funnel: Record<string, number>;
}

export interface GamificationConfig {
  id: string;
  tenant_id: string;
  points_lead_assumed: number;
  points_contact_made: number;
  points_meeting_scheduled: number;
  points_sale_closed: number;
  points_fast_response_bonus: number;
  points_lead_lost: number;
  fast_response_threshold_seconds: number;
  commission_per_sale: number;
  levels: Array<{ key: string; label: string; min_points: number; min_sales?: number; color: string }>;
}

export type GamificationLevel = {
  key: string;
  label: string;
  min_points: number;
  min_sales: number;
  color: string;
};

type RawGamificationLevel = Partial<GamificationLevel> & { min_points?: number | string; min_sales?: number | string };
type RpcResult<T> = Promise<{ data: T | null; error: Error | null }>;
const rpcClient = supabase as unknown as { rpc: <T>(name: string, args?: Record<string, unknown>) => RpcResult<T> };

export const DEFAULT_LEVELS: GamificationLevel[] = [
  { key: "bronze", label: "Bronze", min_points: 0, min_sales: 0, color: "#B45309" },
  { key: "prata", label: "Prata", min_points: 500, min_sales: 5, color: "#94A3B8" },
  { key: "ouro", label: "Ouro", min_points: 1500, min_sales: 10, color: "#D4A017" },
  { key: "diamante", label: "Diamante", min_points: 4000, min_sales: 15, color: "#22D3EE" },
];

export function getGamificationLevels(config?: GamificationConfig | null): GamificationLevel[] {
  const raw = Array.isArray(config?.levels) ? config.levels : [];
  const valid = (raw as RawGamificationLevel[]).filter((level) => {
    return !!level && typeof level.label === "string" && Number.isFinite(Number(level.min_points));
  });

  return (valid.length > 0 ? valid : DEFAULT_LEVELS)
    .map((level: RawGamificationLevel, index: number) => ({
      key: level.key || `level-${index}`,
      label: level.label || DEFAULT_LEVELS[index]?.label || `Nível ${index + 1}`,
      min_points: Number(level.min_points) || 0,
      min_sales: Number.isFinite(Number(level.min_sales))
        ? Number(level.min_sales)
        : (DEFAULT_LEVELS[index]?.min_sales ?? 0),
      color: level.color || DEFAULT_LEVELS[index]?.color || DEFAULT_LEVELS[0].color,
    }))
    .sort((a, b) => a.min_points - b.min_points);
}

export function tierForLevel(current: GamificationLevel, config?: GamificationConfig | null) {
  const levels = getGamificationLevels(config);
  const idx = levels.findIndex((level) => {
    if (current.key && level.key) return level.key === current.key;
    return level.label === current.label;
  });
  return Math.max(1, idx + 1);
}

export function useRanking(period: Period = "monthly") {
  return useQuery<RankingRow[]>({
    queryKey: ["gamification_ranking", period],
    queryFn: async () => {
      const { data, error } = await rpcClient.rpc<RankingRow[]>("gamification_ranking", { _period: period });
      if (error) throw error;
      return ((data ?? []) as RankingRow[]).filter((row) => !isHiddenFeraconPerson(row as unknown as Record<string, unknown>));
    },
    staleTime: 60_000,
  });
}

export function useMyGamificationSummary(period: Period = "monthly") {
  const { user } = useAuth();
  const { member } = useActiveMember();
  const effectiveUser = useEffectiveUser();
  const memberId = effectiveUser.isImpersonating ? effectiveUser.memberId : (member?.id ?? user?.id);
  return useQuery<MemberSummary | null>({
    queryKey: ["gamification_member_summary", memberId, period],
    enabled: !!memberId,
    queryFn: async () => {
      const { data, error } = await rpcClient.rpc<MemberSummary[] | MemberSummary>("gamification_member_summary", {
        _member_id: memberId,
        _period: period,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as MemberSummary | null;
    },
    staleTime: 15_000,
  });
}

export function useTeamOverview(period: Period = "weekly") {
  return useQuery<TeamRow[]>({
    queryKey: ["gamification_team_overview", period],
    queryFn: async () => {
      const { data, error } = await rpcClient.rpc<TeamRow[]>("gamification_team_overview", { _period: period });
      if (error) throw error;
      return ((data ?? []) as TeamRow[]).filter((row) => !isHiddenFeraconPerson(row as unknown as Record<string, unknown>));
    },
    staleTime: 30_000,
  });
}

export function useExecutiveOverview(period: Period = "monthly") {
  return useQuery<ExecutiveOverview | null>({
    queryKey: ["gamification_executive_overview", period],
    queryFn: async () => {
      const { data, error } = await rpcClient.rpc<ExecutiveOverview>("gamification_executive_overview", { _period: period });
      if (error) throw error;
      return (data ?? null) as ExecutiveOverview | null;
    },
    staleTime: 60_000,
  });
}

export function useGamificationConfig() {
  return useQuery<GamificationConfig | null>({
    queryKey: ["gamification_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gamification_config")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data as GamificationConfig | null;
    },
    staleTime: 5 * 60_000,
  });
}

export function levelFor(points: number, config?: GamificationConfig | null, sales: number = 0) {
  const sorted = getGamificationLevels(config);
  const safePoints = Number.isFinite(points) ? points : 0;
  const safeSales = Number.isFinite(sales) ? sales : 0;
  let current = sorted[0] ?? DEFAULT_LEVELS[0];
  let nextIdx = sorted.length > 1 ? 1 : -1;
  for (let i = 0; i < sorted.length; i++) {
    const lv = sorted[i];
    // Sales gate: o consultor só sobe de elo quando atinge o mínimo de
    // pontos E o mínimo de vendas do nível. Sem vendas, não avança.
    if (safePoints >= lv.min_points && safeSales >= (lv.min_sales ?? 0)) {
      current = lv;
      nextIdx = i + 1 < sorted.length ? i + 1 : -1;
    }
  }
  const next: GamificationLevel | null = nextIdx >= 0 ? sorted[nextIdx] : null;
  let progress = 100;
  if (next) {
    const pointsSpan = Math.max(1, next.min_points - current.min_points);
    const salesSpan = Math.max(1, (next.min_sales ?? 0) - (current.min_sales ?? 0));
    const pointsProgress = Math.min(100, ((safePoints - current.min_points) / pointsSpan) * 100);
    const salesProgress = (next.min_sales ?? 0) > (current.min_sales ?? 0)
      ? Math.min(100, ((safeSales - (current.min_sales ?? 0)) / salesSpan) * 100)
      : 100;
    // O progresso real é limitado pelo requisito mais distante (pontos OU vendas).
    progress = Math.max(0, Math.round(Math.min(pointsProgress, salesProgress)));
  }
  return { current, next, progress };
}
