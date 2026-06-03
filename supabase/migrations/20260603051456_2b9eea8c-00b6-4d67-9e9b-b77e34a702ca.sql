REVOKE EXECUTE ON FUNCTION public.ensure_distribution_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_distribution_member(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.list_distribution_consultants(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_distribution_consultants(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_member_distribution(uuid, boolean, numeric, numeric, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_member_distribution(uuid, boolean, numeric, numeric, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_member_notification_channels(uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_member_notification_channels(uuid, boolean, boolean) TO authenticated;