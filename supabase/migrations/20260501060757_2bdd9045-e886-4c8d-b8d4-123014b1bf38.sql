-- Lock down SECURITY DEFINER helper functions: only internal use by RLS policies.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_superadmin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_tenant_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;