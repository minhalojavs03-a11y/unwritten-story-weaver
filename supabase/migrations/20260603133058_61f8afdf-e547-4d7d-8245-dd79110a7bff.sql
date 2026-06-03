DO $$
DECLARE
  v_user_id uuid := '54705a9d-9ee2-4e06-b612-e090ab982edb';
  v_tenant_id uuid := '8b24cfb1-1dd5-463a-934e-56c6efa91d88';
BEGIN
  UPDATE public.tenant_memberships
  SET role = 'supervisor'::public.tenant_role,
      display_name = COALESCE(NULLIF(display_name, ''), 'Antonio Junior'),
      updated_at = now()
  WHERE user_id = v_user_id
    AND tenant_id = v_tenant_id;

  UPDATE public.profiles
  SET role_label = 'Supervisor',
      tenant_id = v_tenant_id,
      updated_at = now()
  WHERE id = v_user_id;

  DELETE FROM public.user_roles
  WHERE user_id = v_user_id
    AND role <> 'superadmin'::public.app_role;

  INSERT INTO public.user_roles (user_id, role, tenant_id)
  VALUES (v_user_id, 'supervisor'::public.app_role, v_tenant_id)
  ON CONFLICT (user_id, role) DO UPDATE
  SET tenant_id = EXCLUDED.tenant_id;
END $$;

CREATE OR REPLACE FUNCTION public.get_my_auth_context()
 RETURNS TABLE(tenant_id uuid, roles app_role[], username text, onboarding_completed boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ctx AS (
    SELECT public.current_tenant_id() AS tenant_id
  )
  SELECT
    ctx.tenant_id,
    COALESCE(
      (
        SELECT array_agg(DISTINCT ur.role)
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND (
            ur.tenant_id = ctx.tenant_id
            OR ur.role = 'superadmin'::public.app_role
          )
      ),
      ARRAY[]::app_role[]
    ) AS roles,
    p.username,
    p.onboarding_completed
  FROM public.profiles p
  CROSS JOIN ctx
  WHERE p.id = auth.uid()
$function$;