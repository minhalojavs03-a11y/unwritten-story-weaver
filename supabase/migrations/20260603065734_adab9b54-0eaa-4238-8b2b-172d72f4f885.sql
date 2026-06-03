
DO $$
DECLARE
  v_arley_tenant uuid := 'ec34dc71-e7a2-4864-abb2-1503520fa5bf';
  v_diessica uuid := 'e7ec5287-3f70-409d-bb3d-f3152e23a397';
  v_renata uuid := 'a452f69e-c5bb-4012-ae5f-b16eddb05051';
  v_new_tenant uuid;
BEGIN
  -- diessica
  INSERT INTO public.tenants (name, plan, slug, created_by, onboarding_completed)
  VALUES ('diessica', 'starter', 'diessica-' || substr(gen_random_uuid()::text,1,6), v_diessica, true)
  RETURNING id INTO v_new_tenant;

  DELETE FROM public.tenant_memberships WHERE user_id = v_diessica AND tenant_id = v_arley_tenant;

  INSERT INTO public.tenant_memberships (tenant_id, user_id, role, display_name)
  VALUES (v_new_tenant, v_diessica, 'owner', 'diessica')
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  UPDATE public.profiles SET tenant_id = v_new_tenant, updated_at = now() WHERE id = v_diessica;

  -- Renata
  INSERT INTO public.tenants (name, plan, slug, created_by, onboarding_completed)
  VALUES ('Renata', 'starter', 'renata-' || substr(gen_random_uuid()::text,1,6), v_renata, true)
  RETURNING id INTO v_new_tenant;

  DELETE FROM public.tenant_memberships WHERE user_id = v_renata AND tenant_id = v_arley_tenant;

  INSERT INTO public.tenant_memberships (tenant_id, user_id, role, display_name)
  VALUES (v_new_tenant, v_renata, 'owner', 'Renata')
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  UPDATE public.profiles SET tenant_id = v_new_tenant, updated_at = now() WHERE id = v_renata;
END $$;
