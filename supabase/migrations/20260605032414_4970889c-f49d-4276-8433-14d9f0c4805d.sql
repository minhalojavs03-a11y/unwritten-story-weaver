
CREATE OR REPLACE FUNCTION public.gamification_ranking(_period text DEFAULT 'monthly'::text)
 RETURNS TABLE(member_id uuid, display_name text, avatar_color text, avatar_url text, role_label text, points bigint, sales bigint, meetings bigint, contacts bigint, leads_assumed bigint, fast_responses bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tid uuid := public.current_tenant_id();
  _s   timestamptz := public.gamification_period_start(_period);
  _cfg public.gamification_config%ROWTYPE;
  _p_sale int := 100;
  _p_meet int := 20;
  _p_contact int := 2;
  _p_assumed int := 5;
  _p_fast int := 5;
BEGIN
  SELECT * INTO _cfg FROM public.gamification_config WHERE tenant_id = _tid LIMIT 1;
  IF FOUND THEN
    _p_sale := COALESCE(_cfg.points_sale_closed, _p_sale);
    _p_meet := COALESCE(_cfg.points_meeting_scheduled, _p_meet);
    _p_contact := COALESCE(_cfg.points_contact_made, _p_contact);
    _p_assumed := COALESCE(_cfg.points_lead_assumed, _p_assumed);
    _p_fast := COALESCE(_cfg.points_fast_response_bonus, _p_fast);
  END IF;

  RETURN QUERY
  WITH
  -- Eventos legados (se existirem)
  _ev AS (
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
  ),
  -- Métricas reais de leads (por user_id do membro)
  _leads_agg AS (
    SELECT m.id AS mid,
           COUNT(*) FILTER (WHERE l.stage = 'comprou' AND l.updated_at >= _s)::bigint AS sls,
           COUNT(*) FILTER (WHERE l.stage IN ('agendado','compareceu','comprou') AND l.updated_at >= _s)::bigint AS mts,
           COUNT(*) FILTER (WHERE l.last_contact_at >= _s)::bigint AS cts,
           COUNT(*) FILTER (WHERE COALESCE(l.assigned_member_at, l.updated_at) >= _s)::bigint AS las
    FROM public.tenant_members m
    LEFT JOIN public.leads l
      ON l.tenant_id = m.tenant_id
     AND l.assigned_to = m.user_id
    WHERE m.tenant_id = _tid
    GROUP BY m.id
  ),
  -- Reuniões reais via appointments
  _appt_agg AS (
    SELECT a.consultant_member_id AS mid,
           COUNT(*)::bigint AS appts
    FROM public.appointments a
    WHERE a.tenant_id = _tid
      AND a.scheduled_at >= _s
      AND a.consultant_member_id IS NOT NULL
    GROUP BY a.consultant_member_id
  ),
  _combined AS (
    SELECT m.id AS mid,
           GREATEST(COALESCE(_ev.sls,0), COALESCE(_leads_agg.sls,0)) AS sls,
           GREATEST(COALESCE(_ev.mts,0), COALESCE(_leads_agg.mts,0), COALESCE(_appt_agg.appts,0)) AS mts,
           GREATEST(COALESCE(_ev.cts,0), COALESCE(_leads_agg.cts,0)) AS cts,
           GREATEST(COALESCE(_ev.las,0), COALESCE(_leads_agg.las,0)) AS las,
           COALESCE(_ev.frs,0) AS frs,
           COALESCE(_ev.pts,0) AS legacy_pts
    FROM public.tenant_members m
    LEFT JOIN _ev ON _ev.mid = m.id
    LEFT JOIN _leads_agg ON _leads_agg.mid = m.id
    LEFT JOIN _appt_agg ON _appt_agg.mid = m.id
    WHERE m.tenant_id = _tid
  )
  SELECT m.id, m.display_name, m.avatar_color, m.avatar_url, m.role_label,
         GREATEST(
           c.legacy_pts,
           (c.sls * _p_sale + c.mts * _p_meet + c.cts * _p_contact + c.las * _p_assumed + c.frs * _p_fast)
         )::bigint AS points,
         c.sls, c.mts, c.cts, c.las, c.frs
  FROM public.tenant_members m
  JOIN _combined c ON c.mid = m.id
  WHERE m.tenant_id = _tid
    AND m.is_active = true
    AND lower(coalesce(m.role_label, '')) NOT IN ('dono','owner','proprietário','proprietario','superadmin')
    AND (m.user_id IS NULL OR NOT public.has_app_role(m.user_id, 'superadmin'::app_role))
    AND (m.user_id IS NULL OR public.get_tenant_role(m.user_id, _tid) IS DISTINCT FROM 'owner'::tenant_role)
  ORDER BY
    GREATEST(
      c.legacy_pts,
      (c.sls * _p_sale + c.mts * _p_meet + c.cts * _p_contact + c.las * _p_assumed + c.frs * _p_fast)
    ) DESC,
    c.sls DESC, c.mts DESC, c.cts DESC, m.display_name ASC;
END $function$;
