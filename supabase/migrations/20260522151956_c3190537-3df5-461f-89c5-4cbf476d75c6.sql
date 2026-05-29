ALTER TABLE public.tenant_members
  ADD COLUMN IF NOT EXISTS max_credit_value numeric;

COMMENT ON COLUMN public.tenant_members.max_credit_value IS
  'Teto de valor de carta de crédito que o consultor pode atender. NULL = sem limite.';

CREATE OR REPLACE FUNCTION public.assume_lead(_lead_id uuid, _member_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tenant uuid;
  _current uuid;
  _member_tenant uuid;
  _can_override boolean;
  _max numeric;
  _credit numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT tenant_id, assigned_member_id, credit_value
    INTO _tenant, _current, _credit
  FROM public.leads WHERE id = _lead_id;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'lead not found'; END IF;

  SELECT tenant_id, max_credit_value INTO _member_tenant, _max
  FROM public.tenant_members WHERE id = _member_id AND is_active = true;
  IF _member_tenant IS NULL OR _member_tenant <> _tenant THEN
    RAISE EXCEPTION 'invalid member';
  END IF;

  _can_override :=
    public.is_superadmin(auth.uid())
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role);

  IF _current IS NOT NULL AND _current <> _member_id AND NOT _can_override THEN
    RAISE EXCEPTION 'lead already assigned to another member';
  END IF;

  IF _max IS NOT NULL AND _credit IS NOT NULL AND _credit > _max AND NOT _can_override THEN
    RAISE EXCEPTION 'lead_out_of_credit_range: teto do consultor R$ %, lead R$ %', _max, _credit;
  END IF;

  UPDATE public.leads
  SET assigned_member_id = _member_id,
      assigned_member_at = now(),
      updated_at = now()
  WHERE id = _lead_id;
END;
$function$;