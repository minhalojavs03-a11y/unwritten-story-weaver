
-- Remove versão simplificada e restaura versão rica (_period) que inclui TODOS
-- os membros ativos (consultor, supervisor, dono) no mesmo ranking.
DROP FUNCTION IF EXISTS public.gamification_ranking(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.gamification_ranking(text);
DROP FUNCTION IF EXISTS public.gamification_member_summary(uuid);
DROP FUNCTION IF EXISTS public.gamification_member_summary(uuid, text);
DROP FUNCTION IF EXISTS public.gamification_team_overview(uuid);
DROP FUNCTION IF EXISTS public.gamification_team_overview(text);

CREATE OR REPLACE FUNCTION public.gamification_period_start(_period text)
RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _period
    WHEN 'daily'   THEN date_trunc('day',   now())
    WHEN 'weekly'  THEN date_trunc('week',  now())
    WHEN 'monthly' THEN date_trunc('month', now())
    ELSE 'epoch'::timestamptz
  END
$$;

CREATE OR REPLACE FUNCTION public.gamification_ranking(_period text DEFAULT 'monthly')
RETURNS TABLE (
  member_id uuid, display_name text, avatar_color text, avatar_url text, role_label text,
  points bigint, sales bigint, meetings bigint, contacts bigint, leads_assumed bigint,
  fast_responses bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _tid uuid := public.current_tenant_id();
        _s   timestamptz := public.gamification_period_start(_period);
BEGIN
  RETURN QUERY
  WITH _agg AS (
    SELECT e.member_id AS mid,
           SUM(e.points)::bigint AS pts,
           COUNT(*) FILTER (WHERE e.event_type='sale_closed')::bigint AS sls,
           COUNT(*) FILTER (WHERE e.event_type='meeting_scheduled')::bigint AS mts,
           COUNT(*) FILTER (WHERE e.event_type='contact_made')::bigint AS cts,
           COUNT(*) FILTER (WHERE e.event_type='lead_assumed')::bigint AS las,
           COUNT(*) FILTER (WHERE e.event_type='fast_response_bonus')::bigint AS frs
    FROM public.gamification_events e
    WHERE e.tenant_id = _tid AND e.occurred_at >= _s
    GROUP BY e.member_id
  )
  SELECT m.id, m.display_name, m.avatar_color, m.avatar_url, m.role_label,
         COALESCE(a.pts,0), COALESCE(a.sls,0), COALESCE(a.mts,0),
         COALESCE(a.cts,0), COALESCE(a.las,0), COALESCE(a.frs,0)
  FROM public.tenant_members m
  LEFT JOIN _agg a ON a.mid = m.id
  WHERE m.tenant_id = _tid
    AND m.is_active = true
  ORDER BY COALESCE(a.pts,0) DESC, m.display_name ASC;
END $$;

CREATE OR REPLACE FUNCTION public.gamification_member_summary(_member_id uuid, _period text DEFAULT 'monthly')
RETURNS TABLE (
  points bigint, sales bigint, meetings bigint, contacts bigint,
  leads_assumed bigint, fast_responses bigint, rank_position int, total_members int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _tid uuid := public.current_tenant_id();
        _s   timestamptz := public.gamification_period_start(_period);
BEGIN
  RETURN QUERY
  WITH _r AS (
    SELECT r.member_id AS mid, r.points AS pts,
           ROW_NUMBER() OVER (ORDER BY r.points DESC)::int AS pos,
           COUNT(*) OVER ()::int AS total
    FROM public.gamification_ranking(_period) r
  ),
  _me AS (
    SELECT
      COALESCE(SUM(e.points),0)::bigint AS pts,
      COUNT(*) FILTER (WHERE e.event_type='sale_closed')::bigint AS sls,
      COUNT(*) FILTER (WHERE e.event_type='meeting_scheduled')::bigint AS mts,
      COUNT(*) FILTER (WHERE e.event_type='contact_made')::bigint AS cts,
      COUNT(*) FILTER (WHERE e.event_type='lead_assumed')::bigint AS las,
      COUNT(*) FILTER (WHERE e.event_type='fast_response_bonus')::bigint AS frs
    FROM public.gamification_events e
    WHERE e.tenant_id = _tid AND e.member_id = _member_id AND e.occurred_at >= _s
  )
  SELECT _me.pts, _me.sls, _me.mts, _me.cts, _me.las, _me.frs,
         COALESCE((SELECT pos FROM _r WHERE mid = _member_id), 0),
         COALESCE((SELECT MAX(total) FROM _r), 0)
  FROM _me;
END $$;

CREATE OR REPLACE FUNCTION public.gamification_team_overview(_period text DEFAULT 'weekly')
RETURNS TABLE (
  member_id uuid, display_name text, avatar_color text, role_label text,
  last_seen_at timestamptz, points bigint, sales bigint, meetings bigint,
  contacts bigint, leads_assumed bigint, active_leads bigint, stalled_leads bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _tid uuid := public.current_tenant_id();
BEGIN
  RETURN QUERY
  WITH _r AS (SELECT * FROM public.gamification_ranking(_period))
  SELECT m.id, m.display_name, m.avatar_color, m.role_label, m.last_seen_at,
         COALESCE(r.points,0), COALESCE(r.sales,0), COALESCE(r.meetings,0),
         COALESCE(r.contacts,0), COALESCE(r.leads_assumed,0),
         (SELECT COUNT(*) FROM public.leads l
            WHERE l.tenant_id = _tid AND l.assigned_member_id = m.id
              AND l.stage NOT IN ('comprou','perdido'))::bigint,
         (SELECT COUNT(*) FROM public.leads l
            WHERE l.tenant_id = _tid AND l.assigned_member_id = m.id
              AND l.stage NOT IN ('comprou','perdido')
              AND COALESCE(l.last_interaction_at, l.updated_at) < now() - interval '48 hours')::bigint
  FROM public.tenant_members m
  LEFT JOIN _r r ON r.member_id = m.id
  WHERE m.tenant_id = _tid AND m.is_active = true
  ORDER BY COALESCE(r.points,0) DESC;
END $$;

GRANT EXECUTE ON FUNCTION public.gamification_ranking(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gamification_member_summary(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gamification_team_overview(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gamification_period_start(text) TO authenticated;
