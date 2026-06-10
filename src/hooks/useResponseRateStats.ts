import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ActorStats = {
  sent: number;
  replied: number;
  leads_contacted?: number;
  leads_responded?: number;
};

export type ResponseRateStats = {
  period: { start: string; end: string };
  messages: { ai: ActorStats; human: ActorStats; total: ActorStats };
  leads: {
    ai: { leads_contacted: number; leads_responded: number };
    human: { leads_contacted: number; leads_responded: number };
    total: { leads_contacted: number; leads_responded: number };
  };
};

export function useResponseRateStats(
  start: Date,
  end: Date,
  memberId?: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: ["response-rate-stats", start.toISOString(), end.toISOString(), memberId ?? null],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ResponseRateStats> => {
      const { data, error } = await supabase.rpc("response_rate_stats", {
        _start: start.toISOString(),
        _end: end.toISOString(),
        _member_id: memberId ?? null,
      });
      if (error) throw error;
      return data as ResponseRateStats;
    },
  });
}

export function safePct(num: number, den: number): number {
  if (!den || den <= 0) return 0;
  return (num / den) * 100;
}
