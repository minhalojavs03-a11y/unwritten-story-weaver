ALTER TABLE public.notification_queue DROP CONSTRAINT IF EXISTS notification_queue_type_check;
ALTER TABLE public.notification_queue ADD CONSTRAINT notification_queue_type_check
  CHECK (type IN ('welcome','consultant_tier_match','announcement'));