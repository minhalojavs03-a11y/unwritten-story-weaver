import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveMember } from "@/contexts/ActiveMemberContext";
import { isHiddenFeraconPerson } from "@/lib/feracon";

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
  levels: Array<{ key: string; label: string; min_points: number; color: string }>;
}

export type GamificationLevel = GamificationConfig["levels"][number];

export const DEFAULT_LEVELS: GamificationLevel[] = [
  { key: "bronze", label: "Bronze", min_points: 0, color: "#B45309" },
  { key: "prata", label: "Prata", min_points: 500, color: "#94A3B8" },
  { key: "ouro", label: "Ouro", min_points: 1500, color: "#D4A017" },
  { key: "diamante", label: "Diamante", min_points: 4000, color: "#22D3EE" },
];

export function getGamificationLevels(config?: GamificationConfig | null): GamificationLevel[] {
  const raw = Array.isArray(config?.levels) ? config.levels : [];
  const valid = raw.filter((level): level is GamificationLevel => {
    return !!level && typeof level.label === "string" && Number.isFinite(Number(level.min_points));
  });

  return (valid.length > 0 ? valid : DEFAULT_LEVELS)
    .map((level, index) => ({
      key: level.key || `level-${index}`,
      label: level.label || DEFAULT_LEVELS[index]?.label || `Nível ${index + 1}`,
      min_points: Number(level.min_points) || 0,
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
      const { data, error } = await (supabase as any).rpc("gamification_ranking", { _period: period });
      if (error) throw error;
      return ((data ?? []) as RankingRow[]).filter((row) => !isHiddenFeraconPerson(row as any));
    },
    staleTime: 60_000,
  });
}

export function useMyGamificationSummary(period: Period = "monthly") {
  const { user } = useAuth();
  const { member } = useActiveMember();
  const memberId = member?.id ?? user?.id;
  return useQuery<MemberSummary | null>({
    queryKey: ["gamification_member_summary", memberId, period],
    enabled: !!memberId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("gamification_member_summary", {
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
      const { data, error } = await (supabase as any).rpc("gamification_team_overview", { _period: period });
      if (error) throw error;
      return ((data ?? []) as TeamRow[]).filter((row) => !isHiddenFeraconPerson(row as any));
    },
    staleTime: 30_000,
  });
}

export function useExecutiveOverview(period: Period = "monthly") {
  return useQuery<ExecutiveOverview | null>({
    queryKey: ["gamification_executive_overview", period],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("gamification_executive_overview", { _period: period });
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
      const { data, error } = await (supabase as any)
        .from("gamification_config")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data as GamificationConfig | null;
    },
    staleTime: 5 * 60_000,
  });
}

export function levelFor(points: number, config?: GamificationConfig | null) {
  const sorted = getGamificationLevels(config);
  const safePoints = Number.isFinite(points) ? points : 0;
  let current = sorted[0] ?? DEFAULT_LEVELS[0];
  let next: GamificationLevel | null = null;
  for (let i = 0; i < sorted.length; i++) {
    if (safePoints >= sorted[i].min_points) {
      current = sorted[i];
      next = sorted[i + 1] ?? null;
    }
  }
  const progress = next
    ? Math.min(100, Math.round(((safePoints - current.min_points) / Math.max(1, next.min_points - current.min_points)) * 100))
    : 100;
  return { current, next, progress };
}
