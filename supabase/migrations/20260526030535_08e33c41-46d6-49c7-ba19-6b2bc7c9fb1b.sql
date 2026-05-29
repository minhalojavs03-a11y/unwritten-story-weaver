CREATE OR REPLACE FUNCTION public.auto_assign_new_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _picked uuid;
BEGIN
  IF NEW.assigned_member_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT tm.id INTO _picked
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
      NEW.credit_value IS NULL
      OR tm.max_credit_value IS NULL
      OR NEW.credit_value <= tm.max_credit_value
    )
  ORDER BY random()
  LIMIT 1;

  IF _picked IS NOT NULL THEN
    NEW.assigned_member_id := _picked;
    NEW.assigned_member_at := now();
    IF NEW.stage IS NULL OR NEW.stage = 'novo' THEN
      NEW.stage := 'atendimento';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;