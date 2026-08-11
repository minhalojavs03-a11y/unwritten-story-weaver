CREATE OR REPLACE FUNCTION public.get_team_funnel(p_tenant_id uuid, p_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant uuid := p_tenant_id;
  v_funnel jsonb;
  v_lost_reasons jsonb;
  v_sales jsonb;
  v_lost int;
  v_meetings int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF v_tenant IS NULL THEN
    v_tenant := '9ecb99e2-50ee-404f-920b-81cd94cc685e'::uuid;
  END IF;

  IF NOT (
    public.has_app_role(v_uid, 'superadmin'::public.app_role)
    OR public.is_tenant_member(v_uid, v_tenant)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('stage', stage, 'count', c) ORDER BY stage), '[]'::jsonb)
    INTO v_funnel
  FROM (
    SELECT l.stage AS stage, COUNT(*) AS c
    FROM public.leads l
    WHERE l.tenant_id = v_tenant
      AND COALESCE(l.kind, 'lead') = 'lead'
      AND (
        p_start IS NULL
        OR (
          CASE
            WHEN l.stage IN ('comprou', 'perdido') THEN COALESCE(l.updated_at, l.last_interaction_at, l.created_at)
            ELSE l.created_at
          END
        ) >= p_start
      )
      AND (
        p_end IS NULL
        OR (
          CASE
            WHEN l.stage IN ('comprou', 'perdido') THEN COALESCE(l.updated_at, l.last_interaction_at, l.created_at)
            ELSE l.created_at
          END
        ) < p_end
      )
      AND NOT public.is_ediane_phone(l.phone)
      AND l.stage IS NOT NULL
      AND l.stage <> 'perdido'
    GROUP BY l.stage
  ) s;

  -- Reuniões agendadas pelos consultores nas anotações do lead (stage 'agendado'
  -- + marcação de reunião). Considera a data da marcação, não a de criação.
  SELECT COUNT(*) INTO v_meetings
  FROM public.leads l
  WHERE l.tenant_id = v_tenant
    AND COALESCE(l.kind, 'lead') = 'lead'
    AND l.stage = 'agendado'
    AND (
      l.lead_phase = 'apresentacao'
      OR NULLIF(TRIM(COALESCE(l.metadata->>'meeting_scheduled_at', '')), '') IS NOT NULL
    )
    AND NOT public.is_ediane_phone(l.phone)
    AND (p_start IS NULL OR COALESCE(
          NULLIF(l.metadata->>'meeting_scheduled_at','')::timestamptz,
          l.updated_at, l.created_at) >= p_start)
    AND (p_end IS NULL OR COALESCE(
          NULLIF(l.metadata->>'meeting_scheduled_at','')::timestamptz,
          l.updated_at, l.created_at) < p_end);

  SELECT COUNT(*) INTO v_lost
  FROM public.leads l
  WHERE l.tenant_id = v_tenant
    AND COALESCE(l.kind, 'lead') = 'lead'
    AND l.stage = 'perdido'
    AND (p_start IS NULL OR COALESCE(l.updated_at, l.last_interaction_at, l.created_at) >= p_start)
    AND (p_end IS NULL OR COALESCE(l.updated_at, l.last_interaction_at, l.created_at) < p_end)
    AND NOT public.is_ediane_phone(l.phone);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'reason', reason,
    'count', c,
    'pct', CASE WHEN v_lost > 0 THEN ROUND((c::numeric / v_lost) * 100, 1) ELSE 0 END
  ) ORDER BY c DESC), '[]'::jsonb)
    INTO v_lost_reasons
  FROM (
    SELECT COALESCE(NULLIF(TRIM(l.disqualification_reason), ''), 'Não informado') AS reason,
           COUNT(*) AS c
    FROM public.leads l
    WHERE l.tenant_id = v_tenant
      AND COALESCE(l.kind, 'lead') = 'lead'
      AND l.stage = 'perdido'
      AND (p_start IS NULL OR COALESCE(l.updated_at, l.last_interaction_at, l.created_at) >= p_start)
      AND (p_end IS NULL OR COALESCE(l.updated_at, l.last_interaction_at, l.created_at) < p_end)
      AND NOT public.is_ediane_phone(l.phone)
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 6
  ) r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id,
    'name', name,
    'phone', '',
    'value', value,
    'consultant', consultant,
    'source', source,
    'assetType', asset_type,
    'soldAt', sold_at
  ) ORDER BY sold_at DESC NULLS LAST), '[]'::jsonb)
    INTO v_sales
  FROM (
    SELECT l.id,
           COALESCE(NULLIF(TRIM(l.name), ''), 'Cliente') AS name,
           COALESCE(l.credit_value, 0) AS value,
           COALESCE(
             NULLIF(TRIM(p.full_name), ''),
             NULLIF(TRIM(tm.display_name), ''),
             NULLIF(TRIM(p.display_name), ''),
             'Consultor'
           ) AS consultant,
           COALESCE(l.source, 'Direto') AS source,
           l.asset_type,
           COALESCE(l.updated_at, l.last_interaction_at, l.created_at) AS sold_at
    FROM public.leads l
    LEFT JOIN public.tenant_members tm ON tm.id = l.assigned_member_id
    LEFT JOIN public.profiles p ON p.id = COALESCE(tm.user_id, l.assigned_to)
    WHERE l.tenant_id = v_tenant
      AND COALESCE(l.kind, 'lead') = 'lead'
      AND l.stage = 'comprou'
      AND (p_start IS NULL OR COALESCE(l.updated_at, l.last_interaction_at, l.created_at) >= p_start)
      AND (p_end IS NULL OR COALESCE(l.updated_at, l.last_interaction_at, l.created_at) < p_end)
      AND NOT public.is_ediane_phone(l.phone)
  ) v;

  RETURN jsonb_build_object(
    'funnel', v_funnel,
    'lost', v_lost,
    'meetingsScheduled', v_meetings,
    'lostReasons', v_lost_reasons,
    'sales', v_sales
  );
END;
$function$;