-- Coluna para vincular lead à identidade interna (tenant_members)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS assigned_member_id uuid REFERENCES public.tenant_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_member_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_assigned_member ON public.leads(assigned_member_id);

-- RPC: assumir lead. Permite se livre, se já é seu, ou se o usuário auth é owner/supervisor/superadmin.
CREATE OR REPLACE FUNCTION public.assume_lead(_lead_id uuid, _member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid;
  _current uuid;
  _member_tenant uuid;
  _can_override boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT tenant_id, assigned_member_id INTO _tenant, _current
  FROM public.leads WHERE id = _lead_id;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'lead not found'; END IF;

  SELECT tenant_id INTO _member_tenant
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

  UPDATE public.leads
  SET assigned_member_id = _member_id,
      assigned_member_at = now(),
      updated_at = now()
  WHERE id = _lead_id;
END;
$$;

-- RPC: liberar lead (somente quem é dono atual, ou owner/supervisor/superadmin).
CREATE OR REPLACE FUNCTION public.release_lead(_lead_id uuid, _member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current uuid;
  _can_override boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT assigned_member_id INTO _current FROM public.leads WHERE id = _lead_id;

  _can_override :=
    public.is_superadmin(auth.uid())
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role);

  IF _current IS NOT NULL AND _current <> _member_id AND NOT _can_override THEN
    RAISE EXCEPTION 'cannot release lead assigned to another member';
  END IF;

  UPDATE public.leads
  SET assigned_member_id = NULL,
      assigned_member_at = NULL,
      updated_at = now()
  WHERE id = _lead_id;
END;
$$;