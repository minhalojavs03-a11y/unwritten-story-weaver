
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

  -- Meia-noite de hoje no fuso America/Sao_Paulo (para contagem diária correta).
  _sp_midnight := ((now() AT TIME ZONE 'America/Sao_Paulo')::date)::timestamp AT TIME ZONE 'America/Sao_Paulo';

  -- =========================================================================
  -- 1) PRIORIDADE OPERACIONAL: Micaelly e Diéssica primeiro.
  --    Enquanto qualquer uma estiver abaixo da cota diária, ela leva o lead.
  --    Ordena por menor contagem hoje (nivelar), com whatsapp conectado se possível.
  -- =========================================================================
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
      )
  )
  SELECT id, user_id INTO _picked, _picked_user
  FROM candidates
  WHERE cnt < lim
  ORDER BY wa_connected DESC, cnt ASC, random()
  LIMIT 1;

  -- =========================================================================
  -- 2) Prioridade não disponível (ambas fora ou bateram cota) → rotação normal
  --    Considera cota diária e whatsapp conectado.
  -- =========================================================================
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

  -- =========================================================================
  -- 3) Todos bateram cota → ignora cota mas mantém origem/faixa e prioriza whatsapp on.
  -- =========================================================================
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
      AND ((_credit IS NULL) OR tm.max_credit_value IS NULL OR _credit <= tm.max_credit_value)
      AND ((_credit IS NULL) OR tm.min_credit_value IS NULL OR _credit >= tm.min_credit_value)
      AND EXISTS (
        SELECT 1 FROM public.whatsapp_instances wi
        WHERE wi.tenant_id = tm.tenant_id
          AND wi.seller_user_id = tm.user_id
          AND (wi.is_connected = true OR wi.status = 'connected')
      )
    ORDER BY random()
    LIMIT 1;
  END IF;

  -- =========================================================================
  -- 4) Ainda nada → qualquer consultor da origem, sem faixa.
  -- =========================================================================
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

  -- 5) Último recurso.
  IF _picked IS NULL THEN
    SELECT tm.id, tm.user_id INTO _picked, _picked_user
    FROM public.tenant_members tm
    WHERE tm.tenant_id = NEW.tenant_id
      AND tm.is_active = true
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
    NEW.assigned_to := _picked_user;
    NEW.assigned_member_at := now();
    IF NEW.stage IS NULL OR NEW.stage = 'novo' THEN
      NEW.stage := 'atendimento';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
