-- Foundation: multi-tenant + auth + roles
CREATE TYPE public.app_role AS ENUM ('superadmin', 'owner', 'attendant');

CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'starter',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_profiles_tenant ON public.profiles(tenant_id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, tenant_id)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_tenant ON public.user_roles(tenant_id);

-- Private schema with security definer functions (avoids recursion in RLS)
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION private.is_superadmin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.has_role(_user_id, 'superadmin'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION private.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Public wrappers (security invoker, delegating to private)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, private AS $$
  SELECT private.has_role(_user_id, _role)
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, private AS $$
  SELECT private.is_superadmin(_user_id)
$$;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, private AS $$
  SELECT private.current_tenant_id()
$$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- get_my_auth_context: convenience RPC for frontend
CREATE OR REPLACE FUNCTION public.get_my_auth_context()
RETURNS TABLE (tenant_id uuid, roles public.app_role[])
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT p.tenant_id,
    COALESCE(array_agg(DISTINCT ur.role) FILTER (WHERE ur.role IS NOT NULL), ARRAY[]::public.app_role[]) AS roles
  FROM public.profiles p
  LEFT JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.id = auth.uid()
  GROUP BY p.tenant_id
$$;

-- First user becomes superadmin
CREATE OR REPLACE FUNCTION public.bootstrap_first_superadmin()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE has_super BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE role = 'superadmin') INTO has_super;
  IF has_super THEN RETURN FALSE; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'superadmin') ON CONFLICT DO NOTHING;
  RETURN TRUE;
END;
$$;

-- Owner creates their own tenant
CREATE OR REPLACE FUNCTION public.create_my_tenant(_name TEXT, _slug TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_tenant_id UUID; existing_tenant UUID; final_slug TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT tenant_id INTO existing_tenant FROM public.profiles WHERE id = auth.uid();
  IF existing_tenant IS NOT NULL THEN RAISE EXCEPTION 'user already belongs to a tenant'; END IF;
  final_slug := COALESCE(NULLIF(_slug,''), lower(regexp_replace(_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(gen_random_uuid()::text, 1, 6));
  INSERT INTO public.tenants (name, slug) VALUES (_name, final_slug) RETURNING id INTO new_tenant_id;
  UPDATE public.profiles SET tenant_id = new_tenant_id WHERE id = auth.uid();
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES (auth.uid(), 'owner', new_tenant_id);
  RETURN new_tenant_id;
END;
$$;

-- Superadmin creates tenants
CREATE OR REPLACE FUNCTION public.admin_create_tenant(_name text, _plan text DEFAULT 'starter', _slug text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE new_tenant_id uuid; base_slug text; final_slug text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'only superadmins can create tenants'; END IF;
  IF length(trim(COALESCE(_name, ''))) < 2 THEN RAISE EXCEPTION 'tenant name is required'; END IF;
  base_slug := lower(trim(_name));
  base_slug := translate(base_slug, 'áàâãäåāăąéèêëēĕėęěíìîïĩīĭóòôõöōŏúùûüũūŭçñýÿ', 'aaaaaaaaaeeeeeeeeeiiiiiiiooooooouuuuuuucny');
  base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  IF base_slug = '' THEN base_slug := 'loja'; END IF;
  final_slug := COALESCE(NULLIF(trim(_slug), ''), base_slug || '-' || substr(gen_random_uuid()::text, 1, 6));
  INSERT INTO public.tenants (name, plan, slug)
  VALUES (trim(_name), COALESCE(NULLIF(trim(_plan), ''), 'starter'), final_slug)
  RETURNING id INTO new_tenant_id;
  RETURN new_tenant_id;
END;
$$;

-- RLS POLICIES
CREATE POLICY "Superadmins can do anything on tenants" ON public.tenants FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Members can view their own tenant" ON public.tenants FOR SELECT TO authenticated USING (id = public.current_tenant_id());
CREATE POLICY "Owners can update their own tenant" ON public.tenants FOR UPDATE TO authenticated USING (id = public.current_tenant_id() AND public.has_role(auth.uid(), 'owner')) WITH CHECK (id = public.current_tenant_id() AND public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Members can view profiles in same tenant" ON public.profiles FOR SELECT TO authenticated USING (tenant_id IS NOT NULL AND tenant_id = public.current_tenant_id());
CREATE POLICY "Superadmins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()));
CREATE POLICY "Superadmins can update all profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Superadmins can insert profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.is_superadmin(auth.uid()));

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Superadmins can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()));
CREATE POLICY "Owners can view roles in their tenant" ON public.user_roles FOR SELECT TO authenticated USING (tenant_id IS NOT NULL AND tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Superadmins can manage all roles" ON public.user_roles FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Owners can manage roles in their tenant" ON public.user_roles FOR ALL TO authenticated USING (tenant_id IS NOT NULL AND tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'owner') AND role <> 'superadmin') WITH CHECK (tenant_id IS NOT NULL AND tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'owner') AND role <> 'superadmin');

-- Grants
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_superadmin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_superadmin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_auth_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_my_tenant(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_tenant(text, text, text) TO authenticated;