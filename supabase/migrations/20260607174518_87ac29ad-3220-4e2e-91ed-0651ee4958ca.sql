CREATE OR REPLACE FUNCTION public.get_dashboard_metrics_v2(
  _tenant_id uuid DEFAULT '9ecb99e2-50ee-404f-920b-81cd94cc685e'::uuid,
  _member_id uuid DEFAULT NULL
)
RETURNS TABLE(
  leads_today integer,
  active_conversations integer,
  appointments_today integer,
  hot_opportunities integer,
  awaiting_response integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  ), scoped_conversations AS (
    SELECT c.*
    FROM public.conversations c
    JOIN scoped_leads l ON l.id = c.lead_id
    WHERE c.tenant_id = _tenant
  )
  SELECT
    COALESCE((
      SELECT count(*)::integer
      FROM scoped_leads l
      WHERE COALESCE(l.stage, '') <> 'historico'
        AND COALESCE(l.assigned_member_at, l.created_at) >= _day_start
        AND COALESCE(l.assigned_member_at, l.created_at) < _day_end
    ), 0) AS leads_today,
    COALESCE((
      SELECT count(*)::integer
      FROM scoped_conversations c
      WHERE c.status = 'open'
    ), 0) AS active_conversations,
    COALESCE((
      SELECT count(*)::integer
      FROM public.appointments a
      WHERE a.tenant_id = _tenant
        AND a.scheduled_at >= _day_start
        AND a.scheduled_at < _day_end
        AND (
          _effective_member_id IS NULL
          OR a.consultant_member_id = _effective_member_id
          OR (a.lead_id IS NOT NULL AND EXISTS (SELECT 1 FROM scoped_leads l WHERE l.id = a.lead_id))
        )
    ), 0) AS appointments_today,
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
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics_v2(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics_v2(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.assume_lead(_lead_id uuid, _member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tenant uuid;
  _current uuid;
  _member_tenant uuid;
  _member_user uuid;
  _can_override boolean;
  _max numeric;
  _credit numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT tenant_id, assigned_member_id, credit_value
    INTO _tenant, _current, _credit
  FROM public.leads WHERE id = _lead_id;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'lead not found'; END IF;

  SELECT tenant_id, max_credit_value, user_id
    INTO _member_tenant, _max, _member_user
  FROM public.tenant_members
  WHERE id = _member_id AND is_active = true;
  IF _member_tenant IS NULL OR _member_tenant <> _tenant THEN
    RAISE EXCEPTION 'invalid member';
  END IF;

  _can_override :=
    public.has_app_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.get_tenant_role(auth.uid(), _tenant) IN ('owner'::public.tenant_role, 'supervisor'::public.tenant_role);

  IF NOT _can_override AND _member_user IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'member does not belong to current user';
  END IF;

  IF _current IS NOT NULL AND _current <> _member_id AND NOT _can_override THEN
    RAISE EXCEPTION 'lead already assigned to another member';
  END IF;

  IF _max IS NOT NULL AND _credit IS NOT NULL AND _credit > _max AND NOT _can_override THEN
    RAISE EXCEPTION 'lead_out_of_credit_range: teto do consultor R$ %, lead R$ %', _max, _credit;
  END IF;

  UPDATE public.leads
  SET assigned_member_id = _member_id,
      assigned_to = COALESCE(_member_user, assigned_to, auth.uid()),
      assigned_member_at = COALESCE(assigned_member_at, now()),
      updated_at = now()
  WHERE id = _lead_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assume_lead(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assume_lead(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.release_lead(_lead_id uuid, _member_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tenant uuid;
  _current uuid;
  _current_user uuid;
  _can_override boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT l.tenant_id, l.assigned_member_id, tm.user_id
    INTO _tenant, _current, _current_user
  FROM public.leads l
  LEFT JOIN public.tenant_members tm ON tm.id = l.assigned_member_id
  WHERE l.id = _lead_id;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'lead not found'; END IF;

  _can_override :=
    public.has_app_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.get_tenant_role(auth.uid(), _tenant) IN ('owner'::public.tenant_role, 'supervisor'::public.tenant_role);

  IF NOT _can_override AND _current_user IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF _member_id IS NOT NULL AND _current IS DISTINCT FROM _member_id AND NOT _can_override THEN
    RAISE EXCEPTION 'lead assigned to another member';
  END IF;

  UPDATE public.leads
  SET assigned_to = NULL,
      assigned_member_id = NULL,
      assigned_member_at = NULL,
      updated_at = now()
  WHERE id = _lead_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_lead(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_lead(uuid, uuid) TO service_role;