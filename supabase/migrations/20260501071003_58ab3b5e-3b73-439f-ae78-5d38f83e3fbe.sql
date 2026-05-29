CREATE OR REPLACE FUNCTION public.admin_create_tenant(_name text, _plan text DEFAULT 'starter', _slug text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
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

  base_slug := lower(trim(_name));
  base_slug := translate(base_slug, 'áàâãäåāăąéèêëēĕėęěíìîïĩīĭóòôõöōŏúùûüũūŭçñýÿÁÀÂÃÄÅĀĂĄÉÈÊËĒĔĖĘĚÍÌÎÏĨĪĬÓÒÔÕÖŌŎÚÙÛÜŨŪŬÇÑÝ', 'aaaaaaaaaeeeeeeeeeiiiiiiiooooooouuuuuuucnyyAAAAAAAAAEEEEEEEEEIIIIIIIOOOOOOOUUUUUUUCNY');
  base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
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