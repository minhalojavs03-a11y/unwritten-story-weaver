
-- Team invites table
CREATE TABLE public.team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_role NOT NULL,
  role_label text,
  display_name text,
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_team_invites_tenant ON public.team_invites(tenant_id);
CREATE INDEX idx_team_invites_email ON public.team_invites(lower(email));
CREATE UNIQUE INDEX uq_team_invites_pending_email_tenant
  ON public.team_invites(tenant_id, lower(email))
  WHERE status = 'pending';

ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage invites in their tenant"
  ON public.team_invites FOR ALL TO authenticated
  USING (is_tenant_owner(tenant_id) AND role <> 'superadmin'::app_role)
  WITH CHECK (is_tenant_owner(tenant_id) AND role <> 'superadmin'::app_role);

CREATE POLICY "Superadmins manage all invites"
  ON public.team_invites FOR ALL TO authenticated
  USING (is_superadmin(auth.uid()))
  WITH CHECK (is_superadmin(auth.uid()));

-- Update handle_new_user to honor pending invites
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _invite public.team_invites%ROWTYPE;
BEGIN
  SELECT * INTO _invite
  FROM public.team_invites
  WHERE lower(email) = lower(NEW.email)
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  INSERT INTO public.profiles (id, email, full_name, tenant_id, display_name, role_label)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    _invite.tenant_id,
    COALESCE(_invite.display_name, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    _invite.role_label
  );

  IF _invite.id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role, tenant_id)
    VALUES (NEW.id, _invite.role, _invite.tenant_id)
    ON CONFLICT DO NOTHING;

    UPDATE public.team_invites
    SET status = 'accepted', accepted_at = now(), accepted_by = NEW.id
    WHERE id = _invite.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Manual accept by token (in case of email mismatch)
CREATE OR REPLACE FUNCTION public.accept_team_invite(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _invite public.team_invites%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO _invite FROM public.team_invites
  WHERE token = _token AND status = 'pending' AND expires_at > now()
  LIMIT 1;

  IF _invite.id IS NULL THEN RAISE EXCEPTION 'invite not found or expired'; END IF;

  UPDATE public.profiles
  SET tenant_id = _invite.tenant_id,
      role_label = COALESCE(_invite.role_label, role_label)
  WHERE id = auth.uid();

  INSERT INTO public.user_roles (user_id, role, tenant_id)
  VALUES (auth.uid(), _invite.role, _invite.tenant_id)
  ON CONFLICT DO NOTHING;

  UPDATE public.team_invites
  SET status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
  WHERE id = _invite.id;

  RETURN _invite.tenant_id;
END;
$$;

-- Lookup invite by token (used by signup page to show context)
CREATE OR REPLACE FUNCTION public.get_invite_by_token(_token text)
RETURNS TABLE(
  email text,
  role public.app_role,
  role_label text,
  display_name text,
  tenant_id uuid,
  tenant_name text,
  expires_at timestamptz,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT i.email, i.role, i.role_label, i.display_name,
         i.tenant_id, t.name AS tenant_name, i.expires_at, i.status
  FROM public.team_invites i
  JOIN public.tenants t ON t.id = i.tenant_id
  WHERE i.token = _token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_invite_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_team_invite(text) TO authenticated;
