CREATE OR REPLACE FUNCTION public.get_dashboard_metrics_v2(_tenant_id uuid DEFAULT '9ecb99e2-50ee-404f-920b-81cd94cc685e'::uuid, _member_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(leads_today integer, active_conversations integer, appointments_today integer, hot_opportunities integer, awaiting_response integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _tenant uuid := COALESCE(_tenant_id, '9ecb99e2-50ee-404f-920b-81cd94cc685e'::uuid);
  _role public.tenant_role;
  _is_superadmin boolean;
  _effective_member_id uuid := _member_id;
  _effective_member_user_id uuid;
  _day_start timestamptz := (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo');
  _day_end timestamptz := ((date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') + interval '1 day') AT TIME ZONE 'America/Sao_Paulo');
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  _is_superadmin := public.has_app_role(_uid, 'superadmin'::public.app_role);
  _role := public.get_tenant_role(_uid, _tenant);

  IF NOT (_is_superadmin OR _role IN ('owner'::public.tenant_role, 'supervisor'::public.tenant_role, 'consultant'::public.tenant_role, 'attendant'::public.tenant_role)) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF _role IN ('consultant'::public.tenant_role, 'attendant'::public.tenant_role) AND NOT _is_superadmin THEN
    SELECT tm.id, tm.user_id
      INTO _effective_member_id, _effective_member_user_id
    FROM public.tenant_members tm
    WHERE tm.tenant_id = _tenant
      AND tm.user_id = _uid
      AND tm.is_active = true
    ORDER BY tm.created_at ASC
    LIMIT 1;
  ELSIF _effective_member_id IS NOT NULL THEN
    SELECT tm.user_id
      INTO _effective_member_user_id
    FROM public.tenant_members tm
    WHERE tm.id = _effective_member_id
      AND tm.tenant_id = _tenant
      AND tm.is_active = true
    LIMIT 1;
  END IF;

  RETURN QUERY
  WITH scoped_leads AS (
    SELECT l.*
    FROM public.leads l
    WHERE l.tenant_id = _tenant
      AND COALESCE(l.kind, 'lead') = 'lead'
      AND (
        _effective_member_id IS NULL
        OR l.assigned_member_id = _effective_member_id
        OR (_effective_member_user_id IS NOT NULL AND l.assigned_member_id IS NULL AND l.assigned_to = _effective_member_user_id)
      )
      AND (NOT public.is_ediane_phone(l.phone) OR _is_superadmin)
  ), scoped_external_leads_today AS (
    SELECT nl.id
    FROM public.nilton_leads nl
    WHERE nl.tenant_id = _tenant
      AND COALESCE(nl.status, '') <> 'historico'
      AND COALESCE(nl.created_time, nl.imported_at) >= _day_start
      AND COALESCE(nl.created_time, nl.imported_at) < _day_end
      AND (
        _effective_member_id IS NULL
        OR (_effective_member_user_id IS NOT NULL AND nl.assigned_to = _effective_member_user_id)
      )
  ), scoped_conversations AS (
    SELECT c.*
    FROM public.conversations c
    JOIN scoped_leads l ON l.id = c.lead_id
    WHERE c.tenant_id = _tenant
  ), meetings_today AS (
    SELECT ('appt:' || a.id::text) AS k
    FROM public.appointments a
    WHERE a.tenant_id = _tenant
      AND a.scheduled_at >= _day_start
      AND a.scheduled_at < _day_end
      AND (
        _effective_member_id IS NULL
        OR a.consultant_member_id = _effective_member_id
        OR (a.lead_id IS NOT NULL AND EXISTS (SELECT 1 FROM scoped_leads l WHERE l.id = a.lead_id))
      )
    UNION
    SELECT DISTINCT ('lead:' || e.lead_id::text) AS k
    FROM public.lead_stage_events e
    WHERE e.tenant_id = _tenant
      AND e.lead_id IS NOT NULL
      AND e.created_at >= _day_start
      AND e.created_at < _day_end
      AND e.label ILIKE 'Reuni%o agendada%'
      AND EXISTS (SELECT 1 FROM scoped_leads l WHERE l.id = e.lead_id)
  )
  SELECT
    (
      COALESCE((
        SELECT count(*)::integer
        FROM scoped_leads l
        WHERE COALESCE(l.stage, '') <> 'historico'
          AND COALESCE(l.assigned_member_at, l.created_at) >= _day_start
          AND COALESCE(l.assigned_member_at, l.created_at) < _day_end
      ), 0)
      + COALESCE((SELECT count(*)::integer FROM scoped_external_leads_today), 0)
    )::integer AS leads_today,
    COALESCE((
      SELECT count(*)::integer
      FROM scoped_conversations c
      WHERE c.status = 'open'
    ), 0) AS active_conversations,
    COALESCE((SELECT count(*)::integer FROM meetings_today), 0) AS appointments_today,
    COALESCE((
      SELECT count(*)::integer
      FROM scoped_leads l
      WHERE l.temperature = 'hot'
        AND COALESCE(l.stage, '') NOT IN ('comprou', 'perdido', 'historico')
    ), 0) AS hot_opportunities,
    COALESCE((
      SELECT count(*)::integer
      FROM scoped_conversations c
      WHERE c.unread_count > 0
    ), 0) AS awaiting_response;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics_v2(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics_v2(uuid, uuid) TO service_role;