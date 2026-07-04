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

  -- 1) Preferência ideal: origem correta + faixa de crédito + instância conectada.
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

  -- 2) Sem WhatsApp conectado? Ainda assim atribui pela origem/faixa.
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
    ORDER BY random()
    LIMIT 1;
  END IF;

  -- 3) Sem ninguém na faixa? A faixa não pode travar: atribui pela origem.
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

  -- 4) Último recurso: qualquer consultor ativo, para nunca ficar sem atribuição.
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

DROP TRIGGER IF EXISTS trg_auto_assign_new_lead ON public.leads;
CREATE TRIGGER trg_auto_assign_new_lead
BEFORE INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.auto_assign_new_lead();

CREATE OR REPLACE FUNCTION public.notify_consultant_by_tier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.credit_value IS NOT DISTINCT FROM NEW.credit_value THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notification_queue (
    tenant_id,
    lead_id,
    type,
    status,
    due_at,
    last_error
  ) VALUES (
    NEW.tenant_id,
    NEW.id,
    'consultant_tier_match',
    'pending',
    now(),
    'auto-enqueued by lead trigger'
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;