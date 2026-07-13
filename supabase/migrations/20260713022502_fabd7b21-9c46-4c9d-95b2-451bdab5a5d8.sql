
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

  -- Pool de consultores elegíveis com contagem do dia (SP) e flag de prioridade.
  WITH base AS (
    SELECT
      tm.id,
      tm.user_id,
      tm.display_name,
      COALESCE(tm.daily_lead_limit, 1) AS lim,
      (
        SELECT COUNT(*) FROM public.leads l
        WHERE l.assigned_member_id = tm.id
          AND (l.assigned_member_at AT TIME ZONE 'America/Sao_Paulo')::date
              = (now() AT TIME ZONE 'America/Sao_Paulo')::date
      ) AS cnt,
      (
        translate(lower(coalesce(tm.display_name, '')),
                  'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')
        ~ '(micaelly|diessica)'
      ) AS is_priority,
      EXISTS (
        SELECT 1 FROM public.whatsapp_instances wi
        WHERE wi.tenant_id = tm.tenant_id
          AND wi.seller_user_id = tm.user_id
          AND (wi.is_connected = true OR wi.status = 'connected')
      ) AS connected,
      (
        (_credit IS NULL OR tm.max_credit_value IS NULL OR _credit <= tm.max_credit_value)
        AND
        (_credit IS NULL OR tm.min_credit_value IS NULL OR _credit >= tm.min_credit_value)
      ) AS in_tier
    FROM public.tenant_members tm
    WHERE tm.tenant_id = NEW.tenant_id
      AND tm.is_active = true
      AND ((_is_leads02 AND tm.receives_leads_02 = true) OR (NOT _is_leads02 AND tm.receives_leads = true))
      AND lower(coalesce(tm.role_label, '')) LIKE '%consultor%'
      AND lower(coalesce(tm.role_label, '')) NOT LIKE '%supervisor%'
      AND lower(coalesce(tm.role_label, '')) NOT LIKE '%aprendiz%'
      AND lower(coalesce(tm.role_label, '')) NOT LIKE '%dono%'
      AND lower(coalesce(tm.display_name, '')) NOT LIKE '%teste%'
  ),
  under_cap AS (
    SELECT * FROM base WHERE cnt < lim AND connected AND in_tier
  ),
  priority_pool AS (
    SELECT * FROM under_cap WHERE is_priority
  ),
  chosen_pool AS (
    SELECT * FROM priority_pool
    UNION ALL
    SELECT * FROM under_cap
    WHERE NOT EXISTS (SELECT 1 FROM priority_pool)
  )
  SELECT id, user_id INTO _picked, _picked_user
  FROM chosen_pool
  ORDER BY cnt ASC, (cnt::float / GREATEST(lim,1)) ASC, random()
  LIMIT 1;

  -- Fallback 1: ignora conexão de WhatsApp mas mantém prioridade e teto.
  IF _picked IS NULL THEN
    WITH base AS (
      SELECT
        tm.id, tm.user_id,
        COALESCE(tm.daily_lead_limit, 1) AS lim,
        (SELECT COUNT(*) FROM public.leads l
         WHERE l.assigned_member_id = tm.id
           AND (l.assigned_member_at AT TIME ZONE 'America/Sao_Paulo')::date
               = (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS cnt,
        (translate(lower(coalesce(tm.display_name, '')),
                   'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')
         ~ '(micaelly|diessica)') AS is_priority,
        ((_credit IS NULL OR tm.max_credit_value IS NULL OR _credit <= tm.max_credit_value)
         AND (_credit IS NULL OR tm.min_credit_value IS NULL OR _credit >= tm.min_credit_value)) AS in_tier
      FROM public.tenant_members tm
      WHERE tm.tenant_id = NEW.tenant_id
        AND tm.is_active = true
        AND ((_is_leads02 AND tm.receives_leads_02 = true) OR (NOT _is_leads02 AND tm.receives_leads = true))
        AND lower(coalesce(tm.role_label, '')) LIKE '%consultor%'
        AND lower(coalesce(tm.role_label, '')) NOT LIKE '%supervisor%'
        AND lower(coalesce(tm.role_label, '')) NOT LIKE '%aprendiz%'
        AND lower(coalesce(tm.role_label, '')) NOT LIKE '%dono%'
        AND lower(coalesce(tm.display_name, '')) NOT LIKE '%teste%'
    ),
    under_cap AS (SELECT * FROM base WHERE cnt < lim AND in_tier),
    priority_pool AS (SELECT * FROM under_cap WHERE is_priority),
    chosen_pool AS (
      SELECT * FROM priority_pool
      UNION ALL
      SELECT * FROM under_cap WHERE NOT EXISTS (SELECT 1 FROM priority_pool)
    )
    SELECT id, user_id INTO _picked, _picked_user
    FROM chosen_pool
    ORDER BY cnt ASC, random()
    LIMIT 1;
  END IF;

  -- Fallback 2: ninguém abaixo do teto na faixa/origem — deixa sem atribuir
  -- (a edge function retenta depois; assim o teto diário é respeitado).
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
