CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS pin_hash text,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_tenant_username_unique
  ON public.profiles (tenant_id, lower(username))
  WHERE username IS NOT NULL;

DROP FUNCTION IF EXISTS public.get_my_auth_context();

CREATE OR REPLACE FUNCTION public.get_my_auth_context()
RETURNS TABLE(
  tenant_id uuid,
  roles app_role[],
  username text,
  onboarding_completed boolean
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p.tenant_id,
    COALESCE(array_agg(DISTINCT ur.role) FILTER (WHERE ur.role IS NOT NULL), ARRAY[]::public.app_role[]) AS roles,
    p.username,
    p.onboarding_completed
  FROM public.profiles p
  LEFT JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.id = auth.uid()
  GROUP BY p.tenant_id, p.username, p.onboarding_completed
$$;

CREATE OR REPLACE FUNCTION public.check_username_available(_username text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid;
  _exists boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF _username IS NULL OR _username !~ '^[a-z0-9_]{3,20}$' THEN RETURN false; END IF;

  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = auth.uid();
  IF _tenant IS NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.profiles
      WHERE lower(username) = lower(_username) AND id <> auth.uid()
    ) INTO _exists;
  ELSE
    SELECT EXISTS(
      SELECT 1 FROM public.profiles
      WHERE tenant_id = _tenant
        AND lower(username) = lower(_username)
        AND id <> auth.uid()
    ) INTO _exists;
  END IF;

  RETURN NOT _exists;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_onboarding(
  _username text,
  _display_name text,
  _pin text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid;
  _normalized text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  _normalized := lower(trim(_username));

  IF _normalized !~ '^[a-z0-9_]{3,20}$' THEN
    RAISE EXCEPTION 'invalid username format';
  END IF;
  IF length(trim(COALESCE(_display_name, ''))) < 2 THEN
    RAISE EXCEPTION 'display name required';
  END IF;
  IF _pin !~ '^[0-9]{4,6}$' THEN
    RAISE EXCEPTION 'pin must be 4 to 6 digits';
  END IF;

  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = auth.uid();

  IF EXISTS(
    SELECT 1 FROM public.profiles
    WHERE tenant_id IS NOT DISTINCT FROM _tenant
      AND lower(username) = _normalized
      AND id <> auth.uid()
  ) THEN
    RAISE EXCEPTION 'username already taken';
  END IF;

  UPDATE public.profiles
  SET username = _normalized,
      display_name = trim(_display_name),
      pin_hash = crypt(_pin, gen_salt('bf')),
      onboarding_completed = true,
      updated_at = now()
  WHERE id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_my_pin(_pin text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hash text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT pin_hash INTO _hash FROM public.profiles WHERE id = auth.uid();
  IF _hash IS NULL THEN RETURN false; END IF;
  RETURN _hash = crypt(_pin, _hash);
END;
$$;