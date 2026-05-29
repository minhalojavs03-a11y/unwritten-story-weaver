-- Tabela de membros internos por tenant (login interno após login geral)
CREATE TABLE IF NOT EXISTS public.tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  username text NOT NULL,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  role_label text,
  avatar_color text NOT NULL DEFAULT '#1E40AF',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, username)
);

ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view tenant_members" ON public.tenant_members
  FOR SELECT TO authenticated
  USING (public.is_tenant_staff(tenant_id));

CREATE POLICY "Owners manage tenant_members" ON public.tenant_members
  FOR ALL TO authenticated
  USING (public.is_tenant_owner(tenant_id))
  WITH CHECK (public.is_tenant_owner(tenant_id));

CREATE POLICY "Superadmins manage all tenant_members" ON public.tenant_members
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

CREATE TRIGGER tenant_members_updated_at
  BEFORE UPDATE ON public.tenant_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPC: lista os @usuários disponíveis no tenant atual (sem senha)
CREATE OR REPLACE FUNCTION public.list_tenant_members_public()
RETURNS TABLE(id uuid, username text, display_name text, role_label text, avatar_color text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.username, m.display_name, m.role_label, m.avatar_color
  FROM public.tenant_members m
  JOIN public.profiles p ON p.id = auth.uid()
  WHERE m.tenant_id = p.tenant_id AND m.is_active = true
  ORDER BY m.display_name;
$$;

-- RPC: verifica @usuário + senha; retorna o membro se válido
CREATE OR REPLACE FUNCTION public.verify_tenant_member(_username text, _password text)
RETURNS TABLE(id uuid, username text, display_name text, role_label text, avatar_color text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE profiles.id = auth.uid();
  IF _tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT m.id, m.username, m.display_name, m.role_label, m.avatar_color
  FROM public.tenant_members m
  WHERE m.tenant_id = _tenant
    AND m.is_active = true
    AND lower(m.username) = lower(trim(_username))
    AND m.password_hash = crypt(_password, m.password_hash)
  LIMIT 1;
END;
$$;

-- Seed: @vendedorteste / senha "teste" na loja Arley Davies
INSERT INTO public.tenant_members (tenant_id, username, password_hash, display_name, role_label)
VALUES (
  'ac72093f-a297-4f45-927f-def8558cf1a1',
  'vendedorteste',
  crypt('teste', gen_salt('bf')),
  'Vendedor Teste',
  'Vendedor'
)
ON CONFLICT (tenant_id, username) DO NOTHING;