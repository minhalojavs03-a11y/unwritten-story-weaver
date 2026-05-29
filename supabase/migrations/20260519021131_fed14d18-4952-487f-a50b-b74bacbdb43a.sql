ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS whatsapp_instance_id uuid;
CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_instance ON public.leads(tenant_id, whatsapp_instance_id);