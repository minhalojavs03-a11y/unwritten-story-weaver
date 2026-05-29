
DROP FUNCTION IF EXISTS public.get_my_auth_context();

CREATE OR REPLACE FUNCTION public.get_my_auth_context()
RETURNS TABLE(
  tenant_id uuid,
  roles app_role[],
  username text,
  onboarding_completed boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT tm.tenant_id FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid() LIMIT 1) AS tenant_id,
    COALESCE(
      (SELECT array_agg(ur.role) FROM public.user_roles ur WHERE ur.user_id = auth.uid()),
      ARRAY[]::app_role[]
    ) AS roles,
    p.username,
    p.onboarding_completed
  FROM public.profiles p
  WHERE p.id = auth.uid()
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_auth_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_auth_context() TO authenticated, service_role;
