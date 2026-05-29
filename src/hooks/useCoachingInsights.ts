import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CoachingInsight = {
  id: string;
  tenant_id: string;
  conversation_id: string;
  lead_id: string | null;
  member_id: string | null;
  message_id: string | null;
  insight_type: "missed_buying_signal" | "should_be_audio" | "low_assertiveness" | "objection_unhandled" | "simulation_sent";
  severity: "low" | "medium" | "high";
  title: string;
  detail: string | null;
  signal_quote: string | null;
  consultant_quote: string | null;
  suggestion: string | null;
  metadata: any;
  resolved_at: string | null;
  created_at: string;
  lead?: { id: string; name: string | null; phone: string | null } | null;
  member?: { id: string; display_name: string | null; avatar_color: string | null; avatar_url: string | null } | null;
};

export function useCoachingInsights(opts: { memberId?: string; days?: number; includeResolved?: boolean; enabled?: boolean } = {}) {
  const days = opts.days ?? 14;
  return useQuery({
    enabled: opts.enabled !== false,
    queryKey: ["coaching_insights", opts.memberId ?? "all", days, opts.includeResolved ?? false],
    queryFn: async (): Promise<CoachingInsight[]> => {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      let q = supabase.from("coaching_insights")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      if (opts.memberId) q = q.eq("member_id", opts.memberId);
      if (!opts.includeResolved) q = q.is("resolved_at", null);
      const { data, error } = await q;
      if (error) throw error;

      const rows = (data ?? []) as CoachingInsight[];
      if (rows.length === 0) return [];

      // A tabela de insights não possui FKs formais para leads/consultores; buscar separado
      // evita erro de relacionamento do PostgREST e impede a tela de cair para “0”.
      const leadIds = [...new Set(rows.map((r) => r.lead_id).filter(Boolean))] as string[];
      const memberIds = [...new Set(rows.map((r) => r.member_id).filter(Boolean))] as string[];

      const [leadsRes, membersRes] = await Promise.all([
        leadIds.length
          ? supabase.from("leads").select("id,name,phone").in("id", leadIds)
          : Promise.resolve({ data: [], error: null }),
        memberIds.length
          ? supabase.from("tenant_members").select("id,display_name,avatar_color,avatar_url").in("id", memberIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const leadMap = new Map((leadsRes.data ?? []).map((l: any) => [l.id, l]));
      const memberMap = new Map((membersRes.data ?? []).map((m: any) => [m.id, m]));

      return rows.map((row) => ({
        ...row,
        lead: row.lead_id ? (leadMap.get(row.lead_id) as any) ?? null : null,
        member: row.member_id ? (memberMap.get(row.member_id) as any) ?? null : null,
      }));
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export async function resolveInsight(id: string) {
  const { error } = await supabase.from("coaching_insights")
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export type MemberCoachingAgg = {
  member_id: string;
  total: number;
  high: number;
  missed_signal: number;
  should_be_audio: number;
  simulations: number;
};

export function useCoachingByMember(days = 30) {
  return useQuery({
    queryKey: ["coaching_by_member", days],
    queryFn: async (): Promise<Record<string, MemberCoachingAgg>> => {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data, error } = await supabase
        .from("coaching_insights")
        .select("member_id, severity, insight_type")
        .gte("created_at", since)
        .is("resolved_at", null)
        .limit(2000);
      if (error) throw error;
      const map: Record<string, MemberCoachingAgg> = {};
      for (const r of (data ?? []) as any[]) {
        const id = r.member_id ?? "—";
        const cur = map[id] ?? { member_id: id, total: 0, high: 0, missed_signal: 0, should_be_audio: 0, simulations: 0 };
        if (r.insight_type === "simulation_sent") {
          cur.simulations += 1;
        } else {
          cur.total += 1;
          if (r.severity === "high") cur.high += 1;
          if (r.insight_type === "missed_buying_signal") cur.missed_signal += 1;
          if (r.insight_type === "should_be_audio") cur.should_be_audio += 1;
        }
        map[id] = cur;
      }
      return map;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export async function runCoachingBackfill(days = 30, force = false) {
  const { data, error } = await supabase.functions.invoke("backfill-coaching", {
    body: { days, force },
  });
  if (error) throw error;
  return data as { queued?: number; skipped?: number; error?: string; force?: boolean };
}
