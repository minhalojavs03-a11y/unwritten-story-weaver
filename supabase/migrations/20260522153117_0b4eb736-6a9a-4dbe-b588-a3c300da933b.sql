
CREATE OR REPLACE FUNCTION public.enforce_lead_credit_limit_on_assign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _max numeric;
  _can_override boolean;
BEGIN
  -- Só valida quando o responsável muda e está sendo definido (não em release)
  IF NEW.assigned_member_id IS NULL
     OR NEW.assigned_member_id IS NOT DISTINCT FROM OLD.assigned_member_id THEN
    RETURN NEW;
  END IF;

  -- Owners / supervisores / superadmin podem atribuir qualquer lead
  _can_override :=
    auth.uid() IS NOT NULL AND (
      public.is_superadmin(auth.uid())
      OR public.has_role(auth.uid(), 'owner'::app_role)
      OR public.has_role(auth.uid(), 'supervisor'::app_role)
    );

  IF _can_override THEN
    RETURN NEW;
  END IF;

  IF NEW.credit_value IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT max_credit_value INTO _max
  FROM public.tenant_members
  WHERE id = NEW.assigned_member_id;

  IF _max IS NOT NULL AND NEW.credit_value > _max THEN
    RAISE EXCEPTION 'lead_out_of_credit_range: teto do consultor R$ %, lead R$ %', _max, NEW.credit_value
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_lead_credit_limit ON public.leads;
CREATE TRIGGER trg_enforce_lead_credit_limit
BEFORE UPDATE OF assigned_member_id ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.enforce_lead_credit_limit_on_assign();
