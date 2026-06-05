
DROP FUNCTION IF EXISTS public.gamification_executive_overview(uuid);
DROP FUNCTION IF EXISTS public.gamification_executive_overview(text);

CREATE OR REPLACE FUNCTION public.gamification_executive_overview(_period text DEFAULT 'monthly'::text)
 RETURNS jsonb
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
  _commission numeric := 0;
  _sales bigint := 0;
  _meetings bigint := 0;
  _contacts bigint := 0;
  _leads_assumed bigint := 0;
  _leads_total bigint := 0;
  _points bigint := 0;
  _revenue numeric := 0;
  _conv numeric := 0;
  _funnel jsonb := '{}'::jsonb;
  _ts jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO _cfg FROM public.gamification_config WHERE tenant_id = _tid LIMIT 1;
  IF FOUND THEN
    _p_sale := COALESCE(_cfg.points_sale_closed, _p_sale);
    _p_meet := COALESCE(_cfg.points_meeting_scheduled, _p_meet);
    _p_contact := COALESCE(_cfg.points_contact_made, _p_contact);
    _p_fast := COALESCE(_cfg.points_fast_response_bonus, _p_fast);
    _commission := COALESCE(_cfg.commission_per_sale, 0);
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE l.stage = 'comprou' AND l.updated_at >= _s),
    COUNT(*) FILTER (WHERE l.stage IN ('agendado','compareceu','comprou') AND l.updated_at >= _s),
    COUNT(*) FILTER (WHERE l.last_contact_at >= _s),
    COUNT(*) FILTER (WHERE COALESCE(l.assigned_member_at, l.updated_at) >= _s AND l.assigned_to IS NOT NULL),
    COUNT(*) FILTER (WHERE l.created_at >= _s),
    COALESCE(SUM(l.credit_value) FILTER (WHERE l.stage = 'comprou' AND l.updated_at >= _s), 0)
  INTO _sales, _meetings, _contacts, _leads_assumed, _leads_total, _revenue
  FROM public.leads l
  WHERE l.tenant_id = _tid;

  IF _commission > 0 THEN
    _revenue := _sales * _commission;
  END IF;

  _points := _sales * _p_sale + _meetings * _p_meet + _contacts * _p_contact;

  IF _leads_total > 0 THEN
    _conv := _sales::numeric / _leads_total::numeric;
  END IF;

  SELECT COALESCE(jsonb_object_agg(stage, count), '{}'::jsonb) INTO _funnel
  FROM (
    SELECT COALESCE(stage,'novo') AS stage, COUNT(*) AS count
    FROM public.leads
    WHERE tenant_id = _tid AND created_at >= _s
    GROUP BY COALESCE(stage,'novo')
  ) s;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day), '[]'::jsonb) INTO _ts
  FROM (
    SELECT to_char(d.day, 'DD/MM') AS day,
           COUNT(*) FILTER (WHERE l.stage = 'comprou')::int AS sales,
           COUNT(*) FILTER (WHERE l.stage IN ('agendado','compareceu','comprou'))::int AS meetings,
           (COUNT(*) FILTER (WHERE l.stage='comprou') * _p_sale
            + COUNT(*) FILTER (WHERE l.stage IN ('agendado','compareceu','comprou')) * _p_meet)::int AS points
    FROM generate_series(date_trunc('day', _s), date_trunc('day', now()), interval '1 day') AS d(day)
    LEFT JOIN public.leads l ON l.tenant_id = _tid AND date_trunc('day', l.updated_at) = d.day
    GROUP BY d.day
  ) t;

  RETURN jsonb_build_object(
    'totals', jsonb_build_object(
      'sales', _sales,
      'meetings', _meetings,
      'contacts', _contacts,
      'leads_assumed', _leads_assumed,
      'leads_total', _leads_total,
      'points', _points
    ),
    'estimated_revenue', _revenue,
    'conversion_rate', _conv,
    'timeseries', _ts,
    'funnel', _funnel
  );
END $function$;
