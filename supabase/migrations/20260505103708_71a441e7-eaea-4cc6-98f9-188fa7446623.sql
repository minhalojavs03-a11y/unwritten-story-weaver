DO $$
DECLARE
  v_user_id uuid := 'c407a3f0-ef85-4c82-b83e-c6182aed1c26';
  v_tenant_id uuid;
  v_slug text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND tenant_id IS NOT NULL) THEN
    RETURN;
  END IF;

  v_slug := 'loja-' || substr(gen_random_uuid()::text, 1, 8);
  INSERT INTO public.tenants (name, slug, plan, status)
  VALUES ('Minha Ótica', v_slug, 'starter', 'active')
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.profiles (id, tenant_id, email, full_name)
  VALUES (v_user_id, v_tenant_id, 'adilielson@gmail.com', 'Adilielson')
  ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id;

  INSERT INTO public.user_roles (user_id, role, tenant_id)
  VALUES (v_user_id, 'owner', v_tenant_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.ai_config (tenant_id) VALUES (v_tenant_id)
  ON CONFLICT (tenant_id) DO NOTHING;
END $$;