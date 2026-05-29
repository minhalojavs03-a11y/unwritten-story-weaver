CREATE OR REPLACE FUNCTION public.get_my_auth_context()
RETURNS TABLE (
  tenant_id uuid,
  roles public.app_role[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.tenant_id,
    COALESCE(array_agg(DISTINCT ur.role) FILTER (WHERE ur.role IS NOT NULL), ARRAY[]::public.app_role[]) AS roles
  FROM public.profiles p
  LEFT JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.id = auth.uid()
  GROUP BY p.tenant_id
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_auth_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_auth_context() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_create_tenant(_name text, _plan text DEFAULT 'starter', _slug text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_tenant_id uuid;
  base_slug text;
  final_slug text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'only superadmins can create tenants';
  END IF;

  IF length(trim(COALESCE(_name, ''))) < 2 THEN
    RAISE EXCEPTION 'tenant name is required';
  END IF;

  base_slug := lower(regexp_replace(unaccent(trim(_name)), '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  IF base_slug = '' THEN
    base_slug := 'loja';
  END IF;

  final_slug := COALESCE(NULLIF(trim(_slug), ''), base_slug || '-' || substr(gen_random_uuid()::text, 1, 6));

  INSERT INTO public.tenants (name, plan, slug)
  VALUES (trim(_name), COALESCE(NULLIF(trim(_plan), ''), 'starter'), final_slug)
  RETURNING id INTO new_tenant_id;

  INSERT INTO public.ai_config (tenant_id)
  VALUES (new_tenant_id)
  ON CONFLICT (tenant_id) DO NOTHING;

  RETURN new_tenant_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_create_tenant(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_tenant(text, text, text) TO authenticated;