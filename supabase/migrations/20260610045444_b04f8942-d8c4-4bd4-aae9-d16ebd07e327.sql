
CREATE OR REPLACE FUNCTION public.response_rate_stats(
  _start timestamptz,
  _end timestamptz,
  _member_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tenant uuid := '9ecb99e2-50ee-404f-920b-81cd94cc685e'::uuid;
  _is_super boolean := public.has_app_role(_uid, 'superadmin'::app_role);
  _role public.tenant_role;
  _eff_member uuid := _member_id;
  _eff_user uuid;
  _result jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  _role := public.get_tenant_role(_uid, _tenant);

  IF _role IN ('consultant'::tenant_role, 'attendant'::tenant_role) AND NOT _is_super THEN
    SELECT id, user_id INTO _eff_member, _eff_user
    FROM public.tenant_members
    WHERE tenant_id = _tenant AND user_id = _uid AND is_active = true
    ORDER BY created_at ASC LIMIT 1;
  ELSIF _eff_member IS NOT NULL THEN
    SELECT user_id INTO _eff_user
    FROM public.tenant_members WHERE id = _eff_member LIMIT 1;
  END IF;

  WITH scoped_leads AS (
    SELECT l.id
    FROM public.leads l
    WHERE l.tenant_id = _tenant
      AND (NOT public.is_ediane_phone(l.phone) OR _is_super)
      AND (
        _eff_member IS NULL
        OR l.assigned_member_id = _eff_member
        OR (_eff_user IS NOT NULL AND l.assigned_member_id IS NULL AND l.assigned_to = _eff_user)
      )
  ),
  outbound AS (
    SELECT m.id, m.lead_id, m.created_at,
           CASE
             WHEN (m.metadata->>'ai')::boolean IS TRUE THEN 'ai'
             ELSE 'human'
           END AS actor
    FROM public.messages m
    JOIN scoped_leads sl ON sl.id = m.lead_id
    WHERE m.direction = 'outbound'
      AND m.created_at >= _start AND m.created_at < _end
  ),
  outbound_with_reply AS (
    SELECT o.id, o.lead_id, o.actor,
           EXISTS (
             SELECT 1 FROM public.messages r
             WHERE r.lead_id = o.lead_id
               AND r.direction = 'inbound'
               AND r.created_at > o.created_at
           ) AS replied
    FROM outbound o
  ),
  msg_stats AS (
    SELECT
      actor,
      COUNT(*)::int AS sent,
      COUNT(*) FILTER (WHERE replied)::int AS replied
    FROM outbound_with_reply
    GROUP BY actor
  ),
  first_outbound_per_lead AS (
    SELECT DISTINCT ON (lead_id) lead_id, id, actor, created_at
    FROM outbound
    ORDER BY lead_id, created_at ASC
  ),
  lead_first_stats AS (
    SELECT
      f.actor,
      COUNT(*)::int AS leads_contacted,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM public.messages r
          WHERE r.lead_id = f.lead_id
            AND r.direction = 'inbound'
            AND r.created_at > f.created_at
        )
      )::int AS leads_responded
    FROM first_outbound_per_lead f
    GROUP BY f.actor
  )
  SELECT jsonb_build_object(
    'period', jsonb_build_object('start', _start, 'end', _end),
    'messages', jsonb_build_object(
      'ai',    COALESCE((SELECT to_jsonb(s) FROM msg_stats s WHERE actor='ai'),    jsonb_build_object('sent',0,'replied',0)),
      'human', COALESCE((SELECT to_jsonb(s) FROM msg_stats s WHERE actor='human'), jsonb_build_object('sent',0,'replied',0)),
      'total', jsonb_build_object(
        'sent',    COALESCE((SELECT SUM(sent)    FROM msg_stats),0),
        'replied', COALESCE((SELECT SUM(replied) FROM msg_stats),0)
      )
    ),
    'leads', jsonb_build_object(
      'ai',    COALESCE((SELECT to_jsonb(s) FROM lead_first_stats s WHERE actor='ai'),    jsonb_build_object('leads_contacted',0,'leads_responded',0)),
      'human', COALESCE((SELECT to_jsonb(s) FROM lead_first_stats s WHERE actor='human'), jsonb_build_object('leads_contacted',0,'leads_responded',0)),
      'total', jsonb_build_object(
        'leads_contacted', COALESCE((SELECT SUM(leads_contacted) FROM lead_first_stats),0),
        'leads_responded', COALESCE((SELECT SUM(leads_responded) FROM lead_first_stats),0)
      )
    )
  ) INTO _result;

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.response_rate_stats(timestamptz, timestamptz, uuid) TO authenticated, service_role;
