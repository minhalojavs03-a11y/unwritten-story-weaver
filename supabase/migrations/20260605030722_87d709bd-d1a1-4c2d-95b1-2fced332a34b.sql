
CREATE OR REPLACE FUNCTION public.gamification_ranking(_period text DEFAULT 'monthly'::text)
 RETURNS TABLE(member_id uuid, display_name text, avatar_color text, avatar_url text, role_label text, points bigint, sales bigint, meetings bigint, contacts bigint, leads_assumed bigint, fast_responses bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
    -- Donos e superadmins ficam fora do ranking — só vendedores (consultor/supervisor/atendente).
    AND lower(coalesce(m.role_label, '')) NOT IN ('dono','owner','proprietário','proprietario','superadmin')
    AND (m.user_id IS NULL OR NOT public.has_app_role(m.user_id, 'superadmin'::app_role))
    AND (m.user_id IS NULL OR public.get_tenant_role(m.user_id, _tid) IS DISTINCT FROM 'owner'::tenant_role)
  ORDER BY COALESCE(a.pts,0) DESC, m.display_name ASC;
END $function$;
