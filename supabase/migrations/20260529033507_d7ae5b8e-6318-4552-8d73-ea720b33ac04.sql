
-- ============================================================
-- FASE 1: Schema novo (CRM multi-tenant com convite por email)
-- ============================================================

-- Enum de roles do tenant
CREATE TYPE public.tenant_role AS ENUM ('owner', 'supervisor', 'consultor');

-- Enum de role global do app (superadmin = staff da plataforma)
CREATE TYPE public.app_role AS ENUM ('superadmin');

-- ------------------------------------------------------------
-- TENANTS
-- ------------------------------------------------------------
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- PROFILES (1-1 com auth.users)
-- ------------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  avatar_color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- USER_ROLES (papéis globais — só 'superadmin' por enquanto)
-- ------------------------------------------------------------
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- TENANT_MEMBERSHIPS (substitui o antigo tenant_members)
-- ------------------------------------------------------------
CREATE TABLE public.tenant_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.tenant_role NOT NULL,
  display_name TEXT,
  avatar_color TEXT,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX idx_tenant_memberships_user ON public.tenant_memberships(user_id);
CREATE INDEX idx_tenant_memberships_tenant ON public.tenant_memberships(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_memberships TO authenticated;
GRANT ALL ON public.tenant_memberships TO service_role;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- TENANT_INVITES (convite por email com token)
-- ------------------------------------------------------------
CREATE TABLE public.tenant_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.tenant_role NOT NULL,
  token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  display_name TEXT,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  accepted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_tenant_invites_pending
  ON public.tenant_invites(tenant_id, lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX idx_tenant_invites_token ON public.tenant_invites(token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_invites TO authenticated;
GRANT ALL ON public.tenant_invites TO service_role;
-- anon precisa SELECT pra rota /invite/:token funcionar antes do login
GRANT SELECT ON public.tenant_invites TO anon;
ALTER TABLE public.tenant_invites ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- IMPERSONATION_LOG (auditoria de "entrar como")
-- ------------------------------------------------------------
CREATE TABLE public.impersonation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reason TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX idx_impersonation_log_admin ON public.impersonation_log(admin_user_id);
CREATE INDEX idx_impersonation_log_tenant ON public.impersonation_log(tenant_id);

GRANT SELECT, INSERT, UPDATE ON public.impersonation_log TO authenticated;
GRANT ALL ON public.impersonation_log TO service_role;
ALTER TABLE public.impersonation_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- FUNÇÕES SECURITY DEFINER (evitam recursão em RLS)
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_app_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_member(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenant_memberships WHERE user_id = _user_id AND tenant_id = _tenant_id);
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_role(_user_id UUID, _tenant_id UUID)
RETURNS public.tenant_role
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.tenant_memberships WHERE user_id = _user_id AND tenant_id = _tenant_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.user_tenant_id(_user_id UUID)
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT tenant_id FROM public.tenant_memberships WHERE user_id = _user_id LIMIT 1;
$$;

-- Contexto de auth consolidado (usado pelo AuthContext do frontend)
CREATE OR REPLACE FUNCTION public.get_my_auth_context()
RETURNS TABLE (
  tenant_id UUID,
  tenant_role public.tenant_role,
  is_superadmin BOOLEAN,
  display_name TEXT,
  email TEXT,
  onboarding_completed BOOLEAN
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    tm.tenant_id,
    tm.role AS tenant_role,
    public.has_app_role(auth.uid(), 'superadmin') AS is_superadmin,
    COALESCE(tm.display_name, p.display_name, p.email) AS display_name,
    p.email,
    t.onboarding_completed
  FROM public.profiles p
  LEFT JOIN public.tenant_memberships tm ON tm.user_id = p.id
  LEFT JOIN public.tenants t ON t.id = tm.tenant_id
  WHERE p.id = auth.uid()
  LIMIT 1;
$$;

-- Aceitar um convite (cria membership + marca convite aceito)
CREATE OR REPLACE FUNCTION public.accept_tenant_invite(_token UUID)
RETURNS TABLE (tenant_id UUID, role public.tenant_role)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invite public.tenant_invites%ROWTYPE;
  v_user_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO v_invite FROM public.tenant_invites WHERE token = _token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Convite inválido'; END IF;
  IF v_invite.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'Convite já utilizado'; END IF;
  IF v_invite.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Convite revogado'; END IF;
  IF v_invite.expires_at < now() THEN RAISE EXCEPTION 'Convite expirado'; END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
  IF lower(v_user_email) <> lower(v_invite.email) THEN
    RAISE EXCEPTION 'Este convite é para outro email (%). Faça login com o email correto.', v_invite.email;
  END IF;

  INSERT INTO public.tenant_memberships (tenant_id, user_id, role, display_name)
  VALUES (v_invite.tenant_id, auth.uid(), v_invite.role, v_invite.display_name)
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  UPDATE public.tenant_invites
  SET accepted_at = now(), accepted_by_user_id = auth.uid()
  WHERE id = v_invite.id;

  RETURN QUERY SELECT v_invite.tenant_id, v_invite.role;
END;
$$;

-- Olhar convite pelo token (público, antes do login)
CREATE OR REPLACE FUNCTION public.get_invite_by_token(_token UUID)
RETURNS TABLE (
  email TEXT,
  role public.tenant_role,
  tenant_name TEXT,
  display_name TEXT,
  expires_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT i.email, i.role, t.name AS tenant_name, i.display_name, i.expires_at, i.accepted_at, i.revoked_at
  FROM public.tenant_invites i
  JOIN public.tenants t ON t.id = i.tenant_id
  WHERE i.token = _token;
$$;

GRANT EXECUTE ON FUNCTION public.get_invite_by_token(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invite(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_auth_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_app_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_role(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_tenant_id(UUID) TO authenticated;

-- ============================================================
-- TRIGGER: cria profile automaticamente ao criar user
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- TRIGGERS updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_tenants_touch BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_memberships_touch BEFORE UPDATE ON public.tenant_memberships
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- TENANTS: usuário vê o tenant ao qual pertence; superadmin vê todos
CREATE POLICY "Members can view their tenant" ON public.tenants
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), id) OR public.has_app_role(auth.uid(), 'superadmin'));

CREATE POLICY "Authenticated can create tenant" ON public.tenants
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "Owner can update tenant" ON public.tenants
  FOR UPDATE TO authenticated
  USING (public.get_tenant_role(auth.uid(), id) = 'owner' OR public.has_app_role(auth.uid(), 'superadmin'));

-- PROFILES: usuário vê o próprio + outros membros do mesmo tenant
CREATE POLICY "User sees own profile" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

CREATE POLICY "User sees tenant peers profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_memberships a
    JOIN public.tenant_memberships b ON a.tenant_id = b.tenant_id
    WHERE a.user_id = auth.uid() AND b.user_id = profiles.id
  ));

CREATE POLICY "User updates own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());

CREATE POLICY "User inserts own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- USER_ROLES: só leitura do próprio (writes via service_role)
CREATE POLICY "User sees own app roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- TENANT_MEMBERSHIPS: membros vêem todos do mesmo tenant
CREATE POLICY "Members see same-tenant memberships" ON public.tenant_memberships
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id) OR public.has_app_role(auth.uid(), 'superadmin'));

CREATE POLICY "Owner/supervisor can update memberships" ON public.tenant_memberships
  FOR UPDATE TO authenticated
  USING (public.get_tenant_role(auth.uid(), tenant_id) IN ('owner','supervisor'));

CREATE POLICY "Owner/supervisor can remove memberships" ON public.tenant_memberships
  FOR DELETE TO authenticated
  USING (public.get_tenant_role(auth.uid(), tenant_id) IN ('owner','supervisor') AND user_id <> auth.uid());

CREATE POLICY "User updates own last_seen" ON public.tenant_memberships
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- TENANT_INVITES
CREATE POLICY "Anon/auth can read invite by token" ON public.tenant_invites
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Owner/supervisor create invites" ON public.tenant_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_tenant_role(auth.uid(), tenant_id) IN ('owner','supervisor')
    AND invited_by = auth.uid()
  );

CREATE POLICY "Owner/supervisor manage invites" ON public.tenant_invites
  FOR UPDATE TO authenticated
  USING (public.get_tenant_role(auth.uid(), tenant_id) IN ('owner','supervisor'));

CREATE POLICY "Owner/supervisor delete invites" ON public.tenant_invites
  FOR DELETE TO authenticated
  USING (public.get_tenant_role(auth.uid(), tenant_id) IN ('owner','supervisor'));

-- IMPERSONATION_LOG: superadmin/owner vê do seu tenant
CREATE POLICY "Admins see impersonation log" ON public.impersonation_log
  FOR SELECT TO authenticated
  USING (
    public.has_app_role(auth.uid(), 'superadmin')
    OR public.get_tenant_role(auth.uid(), tenant_id) = 'owner'
    OR admin_user_id = auth.uid()
  );

CREATE POLICY "Admins write impersonation log" ON public.impersonation_log
  FOR INSERT TO authenticated
  WITH CHECK (
    admin_user_id = auth.uid()
    AND (public.has_app_role(auth.uid(), 'superadmin')
         OR public.get_tenant_role(auth.uid(), tenant_id) = 'owner')
  );

CREATE POLICY "Admin closes own impersonation" ON public.impersonation_log
  FOR UPDATE TO authenticated USING (admin_user_id = auth.uid());
