
CREATE OR REPLACE FUNCTION public.delete_manual_lead(_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _l record;
  _role tenant_role;
  _is_super boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT id, tenant_id, source, imported_from_sheet, assigned_to, assigned_member_id
    INTO _l
  FROM public.leads WHERE id = _lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'lead not found'; END IF;

  IF coalesce(_l.imported_from_sheet, false)
     OR lower(coalesce(_l.source,'')) NOT IN ('manual','') THEN
    RAISE EXCEPTION 'only_manual_leads_can_be_deleted';
  END IF;

  _is_super := public.has_app_role(_uid, 'superadmin'::app_role);
  _role := public.get_tenant_role(_uid, _l.tenant_id);

  IF NOT (_is_super
          OR _role IN ('owner'::tenant_role, 'supervisor'::tenant_role)
          OR _l.assigned_to = _uid
          OR EXISTS (SELECT 1 FROM public.tenant_members tm
                      WHERE tm.id = _l.assigned_member_id AND tm.user_id = _uid)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  DELETE FROM public.messages WHERE lead_id = _lead_id;
  DELETE FROM public.conversations WHERE lead_id = _lead_id;
  DELETE FROM public.leads WHERE id = _lead_id;
END $$;

GRANT EXECUTE ON FUNCTION public.delete_manual_lead(uuid) TO authenticated;
