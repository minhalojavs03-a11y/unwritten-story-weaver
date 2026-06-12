CREATE OR REPLACE FUNCTION public.update_my_tenant_member(
  _member_id uuid,
  _full_name text DEFAULT NULL,
  _display_name text DEFAULT NULL,
  _role_label text DEFAULT NULL,
  _bio text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _avatar_color text DEFAULT NULL,
  _avatar_url text DEFAULT NULL,
  _monthly_goal int DEFAULT NULL,
  _notification_whatsapp boolean DEFAULT NULL,
  _notification_email boolean DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE public.tenant_members
     SET full_name = COALESCE(_full_name, full_name),
         display_name = COALESCE(_display_name, display_name),
         role_label = COALESCE(_role_label, role_label),
         bio = COALESCE(_bio, bio),
         phone = COALESCE(_phone, phone),
         avatar_color = COALESCE(_avatar_color, avatar_color),
         avatar_url = COALESCE(_avatar_url, avatar_url),
         monthly_goal = COALESCE(_monthly_goal, monthly_goal),
         notify_inapp = COALESCE(_notification_whatsapp, notify_inapp),
         notify_whatsapp = COALESCE(_notification_whatsapp, notify_whatsapp),
         updated_at = now()
   WHERE id = _member_id
     AND (
       user_id = auth.uid()
       OR public.has_app_role(auth.uid(), 'superadmin'::public.app_role)
       OR public.get_tenant_role(auth.uid(), tenant_id) IN ('owner'::public.tenant_role, 'supervisor'::public.tenant_role)
     );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member not found or forbidden';
  END IF;
END;
$$;