REVOKE EXECUTE ON FUNCTION public.current_tenant_id() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_superadmin(uuid) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.get_my_auth_context() TO authenticated;