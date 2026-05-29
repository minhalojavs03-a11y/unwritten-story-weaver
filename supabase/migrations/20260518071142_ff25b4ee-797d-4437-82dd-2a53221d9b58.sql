REVOKE EXECUTE ON FUNCTION public.bootstrap_first_superadmin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_superadmin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_my_tenant(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_my_tenant(text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_default_ai_config() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_instance_charge() FROM PUBLIC, anon, authenticated;