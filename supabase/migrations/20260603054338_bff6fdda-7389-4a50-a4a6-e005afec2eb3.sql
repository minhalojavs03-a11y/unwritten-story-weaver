-- Isolate Antonio Junior into his own tenant with role 'supervisor'
DO $$
DECLARE
  v_user uuid := '54705a9d-9ee2-4e06-b612-e090ab982edb';
  v_old_tenant uuid := '9ecb99e2-50ee-404f-920b-81cd94cc685e';
  v_new_tenant uuid;
BEGIN
  SELECT id INTO v_new_tenant FROM public.tenants WHERE lower(name) = 'antonio junior' LIMIT 1;
  IF v_new_tenant IS NULL THEN
    INSERT INTO public.tenants (name, plan, slug, created_by, onboarding_completed)
    VALUES ('Antonio Junior', 'starter', 'antonio-junior-' || substr(gen_random_uuid()::text,1,6), v_user, true)
    RETURNING id INTO v_new_tenant;
  END IF;

  DELETE FROM public.tenant_memberships
    WHERE user_id = v_user AND tenant_id = v_old_tenant;

  INSERT INTO public.tenant_memberships (tenant_id, user_id, role, display_name)
  VALUES (v_new_tenant, v_user, 'supervisor', 'Antonio Junior')
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role, display_name = EXCLUDED.display_name;

  UPDATE public.profiles
    SET tenant_id = v_new_tenant,
        role_label = 'Supervisor',
        updated_at = now()
    WHERE id = v_user;
END $$;