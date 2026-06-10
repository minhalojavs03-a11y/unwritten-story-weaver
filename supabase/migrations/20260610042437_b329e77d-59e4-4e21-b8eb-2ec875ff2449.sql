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
BEGIN
  IF NEW.assigned_member_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  _credit := NEW.credit_value;
  IF _credit IS NULL THEN
    _credit := public.parse_credit_from_interest(NEW.interest);
    IF _credit IS NOT NULL THEN
      NEW.credit_value := _credit;
    END IF;
  END IF;

  SELECT tm.id, tm.user_id INTO _picked, _picked_user
  FROM public.tenant_members tm
  WHERE tm.tenant_id = NEW.tenant_id
    AND tm.is_active = true
    AND tm.receives_leads = true
    AND lower(coalesce(tm.role_label, '')) LIKE '%consultor%'
    AND lower(coalesce(tm.role_label, '')) NOT LIKE '%supervisor%'
    AND lower(coalesce(tm.role_label, '')) NOT LIKE '%aprendiz%'
    AND lower(coalesce(tm.role_label, '')) NOT LIKE '%dono%'
    AND lower(coalesce(tm.display_name, '')) NOT LIKE '%teste%'
    AND lower(coalesce(tm.display_name, '')) NOT LIKE '%test %'
    AND (
      _credit IS NULL
      OR tm.max_credit_value IS NULL
      OR _credit <= tm.max_credit_value
    )
    -- Regra: consultor sem WhatsApp conectado NÃO recebe leads
    AND EXISTS (
      SELECT 1 FROM public.whatsapp_instances wi
      WHERE wi.tenant_id = tm.tenant_id
        AND wi.seller_user_id = tm.user_id
        AND (wi.is_connected = true OR wi.status = 'connected')
    )
  ORDER BY
    CASE WHEN _credit IS NULL THEN 1 ELSE 0 END,
    tm.max_credit_value ASC NULLS LAST,
    random()
  LIMIT 1;

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