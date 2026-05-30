
CREATE TABLE public.tenant_role_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  role tenant_role NOT NULL,
  role_label text,
  token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  max_uses integer,
  uses_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, role)
);

GRANT SELECT ON public.tenant_role_invites TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tenant_role_invites TO authenticated;
GRANT ALL ON public.tenant_role_invites TO service_role;

ALTER TABLE public.tenant_role_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "role_invites_read_by_token"
  ON public.tenant_role_invites FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "role_invites_manage_admins"
  ON public.tenant_role_invites FOR ALL
  TO authenticated
  USING (get_tenant_role(auth.uid(), tenant_id) = ANY (ARRAY['owner'::tenant_role, 'supervisor'::tenant_role]) OR has_app_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (get_tenant_role(auth.uid(), tenant_id) = ANY (ARRAY['owner'::tenant_role, 'supervisor'::tenant_role]) OR has_app_role(auth.uid(), 'superadmin'::app_role));

CREATE TRIGGER trg_tenant_role_invites_updated
BEFORE UPDATE ON public.tenant_role_invites
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Get invite info by token (public)
CREATE OR REPLACE FUNCTION public.get_role_invite_by_token(_token uuid)
RETURNS TABLE(role tenant_role, role_label text, tenant_id uuid, tenant_name text, is_active boolean, expires_at timestamptz, max_uses integer, uses_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.role, i.role_label, i.tenant_id, t.name, i.is_active, i.expires_at, i.max_uses, i.uses_count
  FROM public.tenant_role_invites i
  JOIN public.tenants t ON t.id = i.tenant_id
  WHERE i.token = _token;
$$;

-- Accept a role invite
CREATE OR REPLACE FUNCTION public.accept_role_invite(_token uuid)
RETURNS TABLE(tenant_id uuid, role tenant_role)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.tenant_role_invites%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v FROM public.tenant_role_invites WHERE token = _token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Link inválido'; END IF;
  IF NOT v.is_active THEN RAISE EXCEPTION 'Link desativado'; END IF;
  IF v.expires_at IS NOT NULL AND v.expires_at < now() THEN RAISE EXCEPTION 'Link expirado'; END IF;
  IF v.max_uses IS NOT NULL AND v.uses_count >= v.max_uses THEN RAISE EXCEPTION 'Limite de usos atingido'; END IF;

  IF EXISTS (SELECT 1 FROM public.tenant_memberships WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Você já pertence a uma equipe';
  END IF;

  INSERT INTO public.tenant_memberships (tenant_id, user_id, role)
  VALUES (v.tenant_id, auth.uid(), v.role);

  UPDATE public.tenant_role_invites SET uses_count = uses_count + 1, updated_at = now() WHERE id = v.id;

  RETURN QUERY SELECT v.tenant_id, v.role;
END $$;

-- Ensure 4 default invites exist for caller's tenant
CREATE OR REPLACE FUNCTION public.ensure_tenant_role_invites()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid;
  r tenant_role;
BEGIN
  v_tenant := public.current_tenant_id();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sem tenant'; END IF;
  IF get_tenant_role(auth.uid(), v_tenant) NOT IN ('owner','supervisor') AND NOT has_app_role(auth.uid(),'superadmin') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  FOREACH r IN ARRAY ARRAY['owner','supervisor','consultant','attendant']::tenant_role[] LOOP
    INSERT INTO public.tenant_role_invites (tenant_id, role, created_by)
    VALUES (v_tenant, r, auth.uid())
    ON CONFLICT (tenant_id, role) DO NOTHING;
  END LOOP;
END $$;

-- Regenerate token (rotate)
CREATE OR REPLACE FUNCTION public.regenerate_role_invite(_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_token uuid; v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.tenant_role_invites WHERE id = _id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Não encontrado'; END IF;
  IF get_tenant_role(auth.uid(), v_tenant) NOT IN ('owner','supervisor') AND NOT has_app_role(auth.uid(),'superadmin') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  v_token := gen_random_uuid();
  UPDATE public.tenant_role_invites SET token = v_token, uses_count = 0, updated_at = now() WHERE id = _id;
  RETURN v_token;
END $$;
