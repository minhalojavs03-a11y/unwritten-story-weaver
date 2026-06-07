
DROP POLICY IF EXISTS app_notif_select_own ON public.app_notifications;
CREATE POLICY app_notif_select_own
  ON public.app_notifications FOR SELECT
  TO authenticated
  USING (recipient_user_id = auth.uid() OR public.has_app_role(auth.uid(), 'superadmin'::public.app_role));

DROP POLICY IF EXISTS app_notif_update_own ON public.app_notifications;
CREATE POLICY app_notif_update_own
  ON public.app_notifications FOR UPDATE
  TO authenticated
  USING (recipient_user_id = auth.uid() OR public.has_app_role(auth.uid(), 'superadmin'::public.app_role))
  WITH CHECK (recipient_user_id = auth.uid() OR public.has_app_role(auth.uid(), 'superadmin'::public.app_role));
