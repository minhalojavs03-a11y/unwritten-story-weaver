CREATE OR REPLACE FUNCTION public.auto_assign_new_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _picked uuid;
  _picked_user uuid;
  _credit numeric;
  _source_label text;
  _is_leads02 boolean;
  _sp_midnight timestamptz;
BEGIN
  IF NEW.assigned_member_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.kind, 'lead') = 'outros' THEN
    RETURN NEW;
  END IF;

  _credit := NEW.credit_value;
  IF _credit IS NULL THEN
    _credit := public.parse_credit_from_interest(NEW.interest);
    IF _credit IS NOT NULL THEN
      NEW.credit_value := _credit;
    END IF;
  END IF;

  _source_label := NULLIF(NEW.metadata->>'sheet_source_label', '');
  _is_leads02 := (_source_label = 'Leads 02');

  _sp_midnight := ((now() AT TIME ZONE 'America/Sao_Paulo')::date)::timestamp AT TIME ZONE 'America/Sao_Paulo';

  -- 1) PRIORIDADE: Micaelly, Diéssica e David primeiro (até cota diária).
  WITH candidates AS (
    SELECT
      tm.id,
      tm.user_id,
      COALESCE(tm.daily_lead_limit, 1) AS lim,
      (SELECT count(*) FROM public.leads l
        WHERE l.tenant_id = tm.tenant_id
          AND l.kind = 'lead'
          AND l.assigned_member_id = tm.id
          AND l.assigned_member_at >= _sp_midnight) AS cnt,
      EXISTS (
        SELECT 1 FROM public.whatsapp_instances wi
        WHERE wi.tenant_id = tm.tenant_id
          AND wi.seller_user_id = tm.user_id
          AND (wi.is_connected = true OR wi.status = 'connected')
      ) AS wa_connected
    FROM public.tenant_members tm
    WHERE tm.tenant_id = NEW.tenant_id
      AND tm.is_active = true
      AND ((_is_leads02 AND tm.receives_leads_02 = true) OR (NOT _is_leads02 AND tm.receives_leads = true))
      AND lower(coalesce(tm.role_label, '')) LIKE '%consultor%'
      AND lower(coalesce(tm.role_label, '')) NOT LIKE '%supervisor%'
      AND lower(coalesce(tm.role_label, '')) NOT LIKE '%aprendiz%'
      AND lower(coalesce(tm.role_label, '')) NOT LIKE '%dono%'
      AND lower(coalesce(tm.display_name, '')) NOT LIKE '%teste%'
      AND ((_credit IS NULL) OR tm.max_credit_value IS NULL OR _credit <= tm.max_credit_value)
      AND ((_credit IS NULL) OR tm.min_credit_value IS NULL OR _credit >= tm.min_credit_value)
      AND (
        lower(coalesce(tm.display_name, '')) LIKE '%micaelly%'
        OR lower(coalesce(tm.display_name, '')) LIKE '%diessica%'
        OR lower(coalesce(tm.display_name, '')) LIKE '%diéssica%'
        OR lower(coalesce(tm.display_name, '')) LIKE '%david%'
        OR lower(coalesce(tm.username, '')) LIKE '%david%'
      )
  )
  SELECT id, user_id INTO _picked, _picked_user
  FROM candidates
  WHERE cnt < lim
  ORDER BY wa_connected DESC, cnt ASC, random()
  LIMIT 1;

  -- 2) Rotação normal
  IF _picked IS NULL THEN
    WITH candidates AS (
      SELECT
        tm.id,
        tm.user_id,
        COALESCE(tm.daily_lead_limit, 1) AS lim,
        (SELECT count(*) FROM public.leads l
          WHERE l.tenant_id = tm.tenant_id
            AND l.kind = 'lead'
            AND l.assigned_member_id = tm.id
            AND l.assigned_member_at >= _sp_midnight) AS cnt,
        EXISTS (
          SELECT 1 FROM public.whatsapp_instances wi
          WHERE wi.tenant_id = tm.tenant_id
            AND wi.seller_user_id = tm.user_id
            AND (wi.is_connected = true OR wi.status = 'connected')
        ) AS wa_connected
      FROM public.tenant_members tm
      WHERE tm.tenant_id = NEW.tenant_id
        AND tm.is_active = true
        AND ((_is_leads02 AND tm.receives_leads_02 = true) OR (NOT _is_leads02 AND tm.receives_leads = true))
        AND lower(coalesce(tm.role_label, '')) LIKE '%consultor%'
        AND lower(coalesce(tm.role_label, '')) NOT LIKE '%supervisor%'
        AND lower(coalesce(tm.role_label, '')) NOT LIKE '%aprendiz%'
        AND lower(coalesce(tm.role_label, '')) NOT LIKE '%dono%'
        AND lower(coalesce(tm.display_name, '')) NOT LIKE '%teste%'
        AND ((_credit IS NULL) OR tm.max_credit_value IS NULL OR _credit <= tm.max_credit_value)
        AND ((_credit IS NULL) OR tm.min_credit_value IS NULL OR _credit >= tm.min_credit_value)
    )
    SELECT id, user_id INTO _picked, _picked_user
    FROM candidates
    WHERE cnt < lim
    ORDER BY wa_connected DESC, cnt ASC, random()
    LIMIT 1;
  END IF;

  -- 3) Fallback: qualquer consultor ativo, ignorando cota
  IF _picked IS NULL THEN
    SELECT tm.id, tm.user_id INTO _picked, _picked_user
    FROM public.tenant_members tm
    WHERE tm.tenant_id = NEW.tenant_id
      AND tm.is_active = true
      AND ((_is_leads02 AND tm.receives_leads_02 = true) OR (NOT _is_leads02 AND tm.receives_leads = true))
      AND lower(coalesce(tm.role_label, '')) LIKE '%consultor%'
      AND lower(coalesce(tm.role_label, '')) NOT LIKE '%supervisor%'
      AND lower(coalesce(tm.role_label, '')) NOT LIKE '%aprendiz%'
      AND lower(coalesce(tm.role_label, '')) NOT LIKE '%dono%'
      AND lower(coalesce(tm.display_name, '')) NOT LIKE '%teste%'
    ORDER BY random()
    LIMIT 1;
  END IF;

  IF _picked IS NOT NULL THEN
    NEW.assigned_member_id := _picked;
    NEW.assigned_member_at := now();
    IF _picked_user IS NOT NULL THEN
      NEW.assigned_to := _picked_user;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;