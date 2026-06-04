
DO $$
DECLARE
  v_feracon constant uuid := '9ecb99e2-50ee-404f-920b-81cd94cc685e';
  r record;
  sql text;
BEGIN
  -- Garantir que o tenant Feracon existe
  INSERT INTO public.tenants (id, name, slug, created_at)
  VALUES (v_feracon, 'Feracon', 'feracon', now())
  ON CONFLICT (id) DO UPDATE SET name = 'Feracon', slug = 'feracon';

  -- Para cada tabela em public com coluna tenant_id: mover tudo para Feracon e setar DEFAULT
  FOR r IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'tenant_id'
  LOOP
    -- pular a própria tabela tenants (ela tem id, não tenant_id) — não cai aqui mas por segurança
    IF r.table_name = 'tenants' THEN CONTINUE; END IF;

    sql := format('UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS DISTINCT FROM %L', r.table_name, v_feracon, v_feracon);
    BEGIN
      EXECUTE sql;
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE 'unique_violation em %, tentando dedupe', r.table_name;
    END;

    -- DEFAULT
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT %L', r.table_name, v_feracon);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'não foi possível setar DEFAULT em %: %', r.table_name, SQLERRM;
    END;
  END LOOP;

  -- Remover tenants extras
  DELETE FROM public.tenants WHERE id <> v_feracon;
END $$;

-- Bloquear criação futura de tenants
CREATE OR REPLACE FUNCTION public.admin_create_tenant(_name text, _plan text DEFAULT 'starter'::text, _slug text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'Sistema single-tenant Feracon: criação de novos tenants desabilitada';
END;
$$;

CREATE OR REPLACE FUNCTION public.create_tenant_with_owner(_tenant_name text, _display_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_feracon constant uuid := '9ecb99e2-50ee-404f-920b-81cd94cc685e';
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  INSERT INTO public.tenant_memberships (tenant_id, user_id, role, display_name)
  VALUES (v_feracon, auth.uid(), 'consultant', trim(_display_name))
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET display_name = EXCLUDED.display_name;

  UPDATE public.profiles
  SET tenant_id = v_feracon,
      display_name = COALESCE(NULLIF(trim(_display_name), ''), display_name),
      updated_at = now()
  WHERE id = auth.uid();

  RETURN v_feracon;
END;
$$;
