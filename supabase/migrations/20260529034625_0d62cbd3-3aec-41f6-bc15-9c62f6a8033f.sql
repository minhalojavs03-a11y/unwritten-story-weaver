CREATE OR REPLACE FUNCTION public.create_tenant_with_owner(_tenant_name text, _display_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Block users that already belong to a tenant
  IF EXISTS (SELECT 1 FROM public.tenant_memberships WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Você já pertence a uma conta';
  END IF;

  INSERT INTO public.tenants (name, created_by, onboarding_completed)
  VALUES (trim(_tenant_name), auth.uid(), true)
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.tenant_memberships (tenant_id, user_id, role, display_name)
  VALUES (v_tenant_id, auth.uid(), 'owner', trim(_display_name));

  UPDATE public.profiles SET display_name = trim(_display_name) WHERE id = auth.uid();

  RETURN v_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_tenant_with_owner(text, text) TO authenticated;