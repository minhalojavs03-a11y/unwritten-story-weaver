INSERT INTO public.tenant_memberships (tenant_id, user_id, role, display_name)
SELECT DISTINCT ON (p.tenant_id)
  p.tenant_id,
  p.id,
  'owner'::public.tenant_role,
  COALESCE(NULLIF(p.display_name, ''), split_part(p.email, '@', 1), 'Dono')
FROM public.profiles p
JOIN public.tenants t ON t.id = p.tenant_id
WHERE p.tenant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.tenant_id = p.tenant_id
  )
ORDER BY p.tenant_id, p.created_at ASC
ON CONFLICT (tenant_id, user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_create_tenant(_name text, _plan text DEFAULT 'starter', _slug text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_tenant_id uuid;
  base_slug text;
  final_slug text;
  owner_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.has_app_role(auth.uid(), 'superadmin') THEN RAISE EXCEPTION 'only superadmins can create tenants'; END IF;
  IF length(trim(COALESCE(_name, ''))) < 2 THEN RAISE EXCEPTION 'tenant name is required'; END IF;

  base_slug := lower(trim(_name));
  base_slug := translate(base_slug, 'áàâãäåāăąéèêëēĕėęěíìîïĩīĭóòôõöōŏúùûüũūŭçñýÿ', 'aaaaaaaaaeeeeeeeeeiiiiiiiooooooouuuuuuucny');
  base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  IF base_slug = '' THEN base_slug := 'cliente'; END IF;
  final_slug := COALESCE(NULLIF(trim(_slug), ''), base_slug || '-' || substr(gen_random_uuid()::text, 1, 6));

  INSERT INTO public.tenants (name, plan, slug, created_by, onboarding_completed)
  VALUES (trim(_name), COALESCE(NULLIF(trim(_plan), ''), 'starter'), final_slug, auth.uid(), true)
  RETURNING id INTO new_tenant_id;

  SELECT COALESCE(NULLIF(display_name, ''), split_part(email, '@', 1), trim(_name))
  INTO owner_name
  FROM public.profiles
  WHERE id = auth.uid();

  INSERT INTO public.tenant_memberships (tenant_id, user_id, role, display_name)
  VALUES (new_tenant_id, auth.uid(), 'owner', COALESCE(owner_name, trim(_name)))
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  UPDATE public.profiles
  SET tenant_id = new_tenant_id,
      updated_at = now()
  WHERE id = auth.uid()
    AND tenant_id IS NULL;

  RETURN new_tenant_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_create_tenant(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_tenant(text, text, text) TO authenticated, service_role;