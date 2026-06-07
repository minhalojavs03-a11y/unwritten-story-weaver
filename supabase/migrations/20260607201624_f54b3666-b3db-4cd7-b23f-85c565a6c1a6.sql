
CREATE UNIQUE INDEX IF NOT EXISTS conversations_lead_instance_uniq
  ON public.conversations (lead_id, whatsapp_instance_id)
  WHERE lead_id IS NOT NULL AND whatsapp_instance_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS messages_extid_instance_uniq
  ON public.messages (whatsapp_instance_id, external_id)
  WHERE external_id IS NOT NULL AND whatsapp_instance_id IS NOT NULL;
