CREATE OR REPLACE FUNCTION public.sync_lead_assigned_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  IF NEW.assigned_member_id IS NOT NULL THEN
    SELECT tm.user_id
      INTO v_user_id
    FROM public.tenant_members tm
    WHERE tm.id = NEW.assigned_member_id
      AND tm.tenant_id = NEW.tenant_id
      AND tm.is_active = true
    LIMIT 1;

    IF v_user_id IS NOT NULL THEN
      NEW.assigned_to := v_user_id;
    ELSIF TG_OP = 'INSERT' OR NEW.assigned_member_id IS DISTINCT FROM OLD.assigned_member_id THEN
      NEW.assigned_to := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_lead_assigned_user ON public.leads;
CREATE TRIGGER trg_sync_lead_assigned_user
BEFORE INSERT OR UPDATE OF assigned_member_id, tenant_id ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.sync_lead_assigned_user();

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
  _member_user uuid;
  _can_override boolean;
  _max numeric;
  _credit numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT tenant_id, assigned_member_id, credit_value
    INTO _tenant, _current, _credit
  FROM public.leads WHERE id = _lead_id;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'lead not found'; END IF;

  SELECT tenant_id, max_credit_value, user_id
    INTO _member_tenant, _max, _member_user
  FROM public.tenant_members
  WHERE id = _member_id AND is_active = true;
  IF _member_tenant IS NULL OR _member_tenant <> _tenant THEN
    RAISE EXCEPTION 'invalid member';
  END IF;

  _can_override :=
    public.has_app_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.get_tenant_role(auth.uid(), _tenant) IN ('owner'::public.tenant_role, 'supervisor'::public.tenant_role);

  IF NOT _can_override AND _member_user IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'member does not belong to current user';
  END IF;

  IF _current IS NOT NULL AND _current <> _member_id AND NOT _can_override THEN
    RAISE EXCEPTION 'lead already assigned to another member';
  END IF;

  IF _max IS NOT NULL AND _credit IS NOT NULL AND _credit > _max AND NOT _can_override THEN
    RAISE EXCEPTION 'lead_out_of_credit_range: teto do consultor R$ %, lead R$ %', _max, _credit;
  END IF;

  UPDATE public.leads
  SET assigned_member_id = _member_id,
      assigned_to = _member_user,
      assigned_member_at = COALESCE(assigned_member_at, now()),
      updated_at = now()
  WHERE id = _lead_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assume_lead(_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _tenant uuid;
  _member_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT tenant_id INTO _tenant FROM public.leads WHERE id = _lead_id;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'lead not found'; END IF;

  SELECT tm.id INTO _member_id
  FROM public.tenant_members tm
  WHERE tm.tenant_id = _tenant
    AND tm.user_id = auth.uid()
    AND tm.is_active = true
  ORDER BY tm.created_at ASC
  LIMIT 1;

  IF _member_id IS NULL THEN
    RAISE EXCEPTION 'active member not found for current user';
  END IF;

  PERFORM public.assume_lead(_lead_id, _member_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.sync_lead_assigned_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.assume_lead(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assume_lead(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.assume_lead(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assume_lead(uuid) TO service_role;

UPDATE public.leads l
SET assigned_to = tm.user_id,
    updated_at = now()
FROM public.tenant_members tm
WHERE l.assigned_member_id = tm.id
  AND l.tenant_id = tm.tenant_id
  AND tm.user_id IS NOT NULL
  AND l.assigned_to IS DISTINCT FROM tm.user_id;