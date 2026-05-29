ALTER TABLE public.lead_notifications ADD COLUMN IF NOT EXISTS recipient_member_id uuid;
CREATE INDEX IF NOT EXISTS idx_lead_notifications_lead_id ON public.lead_notifications(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_notifications_member_id ON public.lead_notifications(recipient_member_id);