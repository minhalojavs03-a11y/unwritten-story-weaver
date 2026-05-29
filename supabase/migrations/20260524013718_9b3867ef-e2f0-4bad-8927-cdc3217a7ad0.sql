ALTER TABLE public.notification_queue
  ALTER COLUMN lead_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS recipient_phone text,
  ADD COLUMN IF NOT EXISTS message_text text;