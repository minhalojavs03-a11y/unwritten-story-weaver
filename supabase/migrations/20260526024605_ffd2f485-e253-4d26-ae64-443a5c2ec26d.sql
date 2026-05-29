
CREATE OR REPLACE FUNCTION public.auto_assign_new_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    AND (
      lower(coalesce(tm.role_label, '')) LIKE '%consultor%'
      OR lower(coalesce(tm.role_label, '')) LIKE '%vendedor%'
    )
    AND lower(coalesce(tm.role_label, '')) NOT LIKE '%supervisor%'
    AND lower(coalesce(tm.role_label, '')) NOT LIKE '%aprendiz%'
    AND lower(coalesce(tm.role_label, '')) NOT LIKE '%dono%'
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
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_new_lead ON public.leads;
CREATE TRIGGER trg_auto_assign_new_lead
BEFORE INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_new_lead();

-- Backfill: leads das últimas 24h ainda sem responsável
UPDATE public.leads l
SET assigned_member_id = (
      SELECT tm.id
      FROM public.tenant_members tm
      WHERE tm.tenant_id = l.tenant_id
        AND tm.is_active = true
        AND tm.receives_leads = true
        AND (
          lower(coalesce(tm.role_label, '')) LIKE '%consultor%'
          OR lower(coalesce(tm.role_label, '')) LIKE '%vendedor%'
        )
        AND lower(coalesce(tm.role_label, '')) NOT LIKE '%supervisor%'
        AND lower(coalesce(tm.role_label, '')) NOT LIKE '%aprendiz%'
        AND lower(coalesce(tm.role_label, '')) NOT LIKE '%dono%'
        AND (
          l.credit_value IS NULL
          OR tm.max_credit_value IS NULL
          OR l.credit_value <= tm.max_credit_value
        )
      ORDER BY random()
      LIMIT 1
    ),
    assigned_member_at = now(),
    stage = CASE WHEN coalesce(l.stage,'novo') = 'novo' THEN 'atendimento' ELSE l.stage END
WHERE l.assigned_member_id IS NULL
  AND l.created_at >= (now() - interval '24 hours');
