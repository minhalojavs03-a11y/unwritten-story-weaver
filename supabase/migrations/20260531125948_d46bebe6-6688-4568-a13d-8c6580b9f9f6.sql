CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (
      SELECT p.tenant_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id IS NOT NULL
        AND (
          public.has_app_role(auth.uid(), 'superadmin'::public.app_role)
          OR EXISTS (
            SELECT 1
            FROM public.tenant_memberships tm
            WHERE tm.user_id = auth.uid()
              AND tm.tenant_id = p.tenant_id
          )
        )
      LIMIT 1
    ),
    (
      SELECT tm.tenant_id
      FROM public.tenant_memberships tm
      WHERE tm.user_id = auth.uid()
      ORDER BY tm.created_at ASC
      LIMIT 1
    )
  )
$function$;

GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO service_role;

CREATE OR REPLACE FUNCTION public.user_tenant_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (
      SELECT p.tenant_id
      FROM public.profiles p
      WHERE p.id = _user_id
        AND p.tenant_id IS NOT NULL
        AND (
          public.has_app_role(_user_id, 'superadmin'::public.app_role)
          OR EXISTS (
            SELECT 1
            FROM public.tenant_memberships tm
            WHERE tm.user_id = _user_id
              AND tm.tenant_id = p.tenant_id
          )
        )
      LIMIT 1
    ),
    (
      SELECT tm.tenant_id
      FROM public.tenant_memberships tm
      WHERE tm.user_id = _user_id
      ORDER BY tm.created_at ASC
      LIMIT 1
    )
  )
$function$;

GRANT EXECUTE ON FUNCTION public.user_tenant_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_tenant_id(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_auth_context()
RETURNS TABLE(tenant_id uuid, roles app_role[], username text, onboarding_completed boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.current_tenant_id() AS tenant_id,
    COALESCE(
      (SELECT array_agg(ur.role) FROM public.user_roles ur WHERE ur.user_id = auth.uid()),
      ARRAY[]::app_role[]
    ) AS roles,
    p.username,
    p.onboarding_completed
  FROM public.profiles p
  WHERE p.id = auth.uid()
$function$;

GRANT EXECUTE ON FUNCTION public.get_my_auth_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_auth_context() TO service_role;