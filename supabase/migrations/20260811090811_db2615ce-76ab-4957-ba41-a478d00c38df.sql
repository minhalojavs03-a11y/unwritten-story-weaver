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
  _p_fast int := 5;
BEGIN
  SELECT * INTO _cfg FROM public.gamification_config WHERE tenant_id = _tid LIMIT 1;
  IF FOUND THEN
    _p_sale := COALESCE(_cfg.points_sale_closed, _p_sale);
    _p_meet := COALESCE(_cfg.points_meeting_scheduled, _p_meet);
    _p_contact := COALESCE(_cfg.points_contact_made, _p_contact);
    _p_fast := COALESCE(_cfg.points_fast_response_bonus, _p_fast);
  END IF;

  RETURN QUERY
  WITH _lead_events AS (
    -- Uma linha por lead do consultor, com as datas efetivas de venda / reunião
    SELECT m.id AS mid,
           l.id AS lead_id,
           (l.stage = 'comprou') AS is_sale,
           (l.stage IN ('agendado','compareceu','comprou')) AS is_meeting,
           COALESCE(
             NULLIF(l.metadata->>'sale_date','')::timestamptz,
             l.updated_at
           ) AS sale_at,
           l.updated_at AS meeting_at,
           l.last_contact_at,
           COALESCE(l.assigned_member_at, l.updated_at) AS assumed_at
    FROM public.tenant_members m
    JOIN public.leads l
      ON l.tenant_id = m.tenant_id
     AND (l.assigned_member_id = m.id OR (l.assigned_member_id IS NULL AND l.assigned_to = m.user_id))
    WHERE m.tenant_id = _tid
  ),
  _leads_agg AS (
    SELECT mid,
           COUNT(*) FILTER (WHERE is_sale AND sale_at >= _s)::bigint AS sls,
           COUNT(*) FILTER (WHERE is_contact_window)::bigint AS cts,
           COUNT(*) FILTER (WHERE assumed_at >= _s)::bigint AS las
    FROM (
      SELECT le.*, (le.last_contact_at >= _s) AS is_contact_window FROM _lead_events le
    ) x
    GROUP BY mid
  ),
  -- Reuniões: leads que chegaram ao estágio de reunião + compromissos reais da agenda,
  -- contando cada lead uma única vez (sem duplicar entre as duas fontes).
  _meeting_units AS (
    SELECT mid, lead_id::text AS unit
    FROM _lead_events
    WHERE is_meeting AND meeting_at >= _s
    UNION
    SELECT a.consultant_member_id AS mid,
           COALESCE(a.lead_id::text, 'appt:' || a.id::text) AS unit
    FROM public.appointments a
    WHERE a.tenant_id = _tid
      AND a.scheduled_at >= _s
      AND a.consultant_member_id IS NOT NULL
      AND COALESCE(a.status,'') NOT IN ('cancelled','canceled','cancelado','no_show')
  ),
  _meet_agg AS (
    SELECT mid, COUNT(DISTINCT unit)::bigint AS mts FROM _meeting_units GROUP BY mid
  ),
  _ev AS (
    SELECT e.member_id AS mid,
           COUNT(*) FILTER (WHERE e.event_type='fast_response_bonus')::bigint AS frs
    FROM public.gamification_events e
    WHERE e.tenant_id = _tid AND e.occurred_at >= _s
    GROUP BY e.member_id
  ),
  _combined AS (
    SELECT m.id AS mid,
           COALESCE(_leads_agg.sls,0) AS sls,
           COALESCE(_meet_agg.mts,0) AS mts,
           COALESCE(_leads_agg.cts,0) AS cts,
           COALESCE(_leads_agg.las,0) AS las,
           COALESCE(_ev.frs,0) AS frs
    FROM public.tenant_members m
    LEFT JOIN _leads_agg ON _leads_agg.mid = m.id
    LEFT JOIN _meet_agg ON _meet_agg.mid = m.id
    LEFT JOIN _ev ON _ev.mid = m.id
    WHERE m.tenant_id = _tid
  )
  SELECT m.id, m.display_name, m.avatar_color, m.avatar_url, m.role_label,
         (c.sls * _p_sale + c.mts * _p_meet + c.cts * _p_contact + c.frs * _p_fast)::bigint AS points,
         c.sls, c.mts, c.cts, c.las, c.frs
  FROM public.tenant_members m
  JOIN _combined c ON c.mid = m.id
  WHERE m.tenant_id = _tid
    AND m.is_active = true
    AND lower(coalesce(m.role_label, '')) NOT IN ('dono','owner','proprietário','proprietario','superadmin')
    AND (m.user_id IS NULL OR NOT public.has_app_role(m.user_id, 'superadmin'::app_role))
    AND (m.user_id IS NULL OR public.get_tenant_role(m.user_id, _tid) IS DISTINCT FROM 'owner'::tenant_role)
  ORDER BY c.sls DESC, c.mts DESC, c.cts DESC, m.display_name ASC;
END $function$;