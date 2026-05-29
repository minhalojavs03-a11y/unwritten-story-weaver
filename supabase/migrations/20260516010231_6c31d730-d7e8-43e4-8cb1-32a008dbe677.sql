ALTER TABLE public.whatsapp_sellers
  ADD COLUMN IF NOT EXISTS last_notified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_whatsapp_sellers_rotation
  ON public.whatsapp_sellers (whatsapp_instance_id, notify_on_new_lead, last_notified_at NULLS FIRST);