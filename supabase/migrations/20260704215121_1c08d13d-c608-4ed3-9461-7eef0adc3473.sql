
CREATE OR REPLACE FUNCTION public.get_team_funnel(
  p_tenant_id uuid,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant uuid := p_tenant_id;
  v_funnel jsonb;
  v_lost_reasons jsonb;
  v_sales jsonb;
  v_lost int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF v_tenant IS NULL THEN
    v_tenant := '9ecb99e2-50ee-404f-920b-81cd94cc685e'::uuid; -- FERACON_TENANT_ID
  END IF;

  -- Autorização: superadmin, membro do tenant, ou owner/supervisor/consultor no tenant
  IF NOT (
    has_app_role(v_uid, 'superadmin'::app_role)
    OR is_tenant_member(v_uid, v_tenant)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Funil por stage (exclui perdido / não-lead)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('stage', stage, 'count', c) ORDER BY stage), '[]'::jsonb)
    INTO v_funnel
  FROM (
    SELECT l.stage AS stage, COUNT(*) AS c
    FROM leads l
    WHERE l.tenant_id = v_tenant
      AND COALESCE(l.kind, 'lead') = 'lead'
      AND (p_start IS NULL OR l.created_at >= p_start)
      AND (p_end IS NULL OR l.created_at < p_end)
      AND NOT is_ediane_phone(l.phone)
      AND l.stage IS NOT NULL
      AND l.stage <> 'perdido'
    GROUP BY l.stage
  ) s;

  -- Perdidos + razões
  SELECT COUNT(*) INTO v_lost
  FROM leads l
  WHERE l.tenant_id = v_tenant
    AND COALESCE(l.kind, 'lead') = 'lead'
    AND l.stage = 'perdido'
    AND (p_start IS NULL OR l.created_at >= p_start)
    AND (p_end IS NULL OR l.created_at < p_end)
    AND NOT is_ediane_phone(l.phone);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'reason', reason,
    'count', c,
    'pct', CASE WHEN v_lost > 0 THEN ROUND((c::numeric / v_lost) * 100, 1) ELSE 0 END
  ) ORDER BY c DESC), '[]'::jsonb)
    INTO v_lost_reasons
  FROM (
    SELECT COALESCE(NULLIF(TRIM(l.disqualification_reason), ''), 'Não informado') AS reason,
           COUNT(*) AS c
    FROM leads l
    WHERE l.tenant_id = v_tenant
      AND COALESCE(l.kind, 'lead') = 'lead'
      AND l.stage = 'perdido'
      AND (p_start IS NULL OR l.created_at >= p_start)
      AND (p_end IS NULL OR l.created_at < p_end)
      AND NOT is_ediane_phone(l.phone)
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 6
  ) r;

  -- Vendas (sem telefone/e-mail), com nome do consultor
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
    FROM leads l
    LEFT JOIN tenant_members tm ON tm.id = l.assigned_member_id
    LEFT JOIN profiles p ON p.id = COALESCE(tm.user_id, l.assigned_to)
    WHERE l.tenant_id = v_tenant
      AND l.stage = 'comprou'
      AND (p_start IS NULL OR l.created_at >= p_start)
      AND (p_end IS NULL OR l.created_at < p_end)
      AND NOT is_ediane_phone(l.phone)
  ) v;

  RETURN jsonb_build_object(
    'funnel', v_funnel,
    'lost', v_lost,
    'lostReasons', v_lost_reasons,
    'sales', v_sales
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_funnel(uuid, timestamptz, timestamptz) TO authenticated, service_role;
