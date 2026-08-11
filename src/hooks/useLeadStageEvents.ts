import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FERACON_TENANT_ID } from "@/lib/feracon";

export type LeadStageEvent = {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  lead_name: string | null;
  member_id: string | null;
  member_name: string | null;
  label: string;
  stage: string | null;
  created_at: string;
};

/**
 * Últimas atualizações de etapa dos leads, em tempo real.
 * - Gestores (privileged): veem o time todo, podem filtrar por consultor.
 * - Consultores: só os eventos deles (memberId obrigatório).
 */
export function useLeadStageEvents(opts: {
  tenantId?: string | null;
  memberId?: string | null;
  limit?: number;
}) {
  const tenantId = opts.tenantId ?? FERACON_TENANT_ID;
  const memberId = opts.memberId ?? null;
  const limit = opts.limit ?? 50;
  const [events, setEvents] = useState<LeadStageEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      let q = supabase
        .from("lead_stage_events")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (memberId) q = q.eq("member_id", memberId);
      const { data } = await q;
      if (cancelled) return;
      setEvents((data ?? []) as LeadStageEvent[]);
      setLoading(false);
    })();

    const channel = supabase
      .channel(`lead-stage-events-${tenantId}-${memberId ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lead_stage_events", filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const ev = payload.new as LeadStageEvent;
          if (memberId && ev.member_id !== memberId) return;
          setEvents((prev) => (prev.some((e) => e.id === ev.id) ? prev : [ev, ...prev].slice(0, limit)));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [tenantId, memberId, limit]);

  return { events, loading };
}
