-- 1. Add notification channel toggles to tenant_members
ALTER TABLE public.tenant_members
  ADD COLUMN IF NOT EXISTS notify_inapp boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_whatsapp boolean NOT NULL DEFAULT true;

-- 2. app_notifications table
CREATE TABLE IF NOT EXISTS public.app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  recipient_user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'new_lead',
  title text NOT NULL,
  body text NOT NULL,
  lead_id uuid,
  read boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_notif_recipient_created
  ON public.app_notifications (recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_notif_tenant_created
  ON public.app_notifications (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_notif_lead
  ON public.app_notifications (lead_id);

GRANT SELECT, UPDATE ON public.app_notifications TO authenticated;
GRANT ALL ON public.app_notifications TO service_role;

ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_notif_select_own"
  ON public.app_notifications FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid());

CREATE POLICY "app_notif_update_own"
  ON public.app_notifications FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

-- Realtime: ensure full row data, add to publication
ALTER TABLE public.app_notifications REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'app_notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.app_notifications';
  END IF;
END $$;

-- 3. whatsapp_notification_log table
CREATE TABLE IF NOT EXISTS public.whatsapp_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  consultant_member_id uuid,
  lead_id uuid,
  status text NOT NULL DEFAULT 'sent',
  error_message text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_notif_log_consultant_sent
  ON public.whatsapp_notification_log (consultant_member_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_notif_log_tenant_sent
  ON public.whatsapp_notification_log (tenant_id, sent_at DESC);

GRANT SELECT ON public.whatsapp_notification_log TO authenticated;
GRANT ALL ON public.whatsapp_notification_log TO service_role;

ALTER TABLE public.whatsapp_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_log_select_owner_sup"
  ON public.whatsapp_notification_log FOR SELECT TO authenticated
  USING (
    public.has_app_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.get_tenant_role(auth.uid(), tenant_id) = ANY (ARRAY['owner'::public.tenant_role, 'supervisor'::public.tenant_role])
  );

-- 4. RPC to also update notification channel toggles (superadmin/owner only)
CREATE OR REPLACE FUNCTION public.update_member_notification_channels(
  _member_id uuid,
  _notify_inapp boolean,
  _notify_whatsapp boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT tenant_id INTO v_tenant FROM public.tenant_members WHERE id = _member_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'member not found'; END IF;
  IF NOT public.has_app_role(auth.uid(), 'superadmin'::app_role)
     AND public.get_tenant_role(auth.uid(), v_tenant) <> 'owner'::tenant_role THEN
    RAISE EXCEPTION 'forbidden: only owner or superadmin can edit notification channels';
  END IF;
  UPDATE public.tenant_members
     SET notify_inapp = coalesce(_notify_inapp, notify_inapp),
         notify_whatsapp = coalesce(_notify_whatsapp, notify_whatsapp),
         updated_at = now()
   WHERE id = _member_id;
END $$;