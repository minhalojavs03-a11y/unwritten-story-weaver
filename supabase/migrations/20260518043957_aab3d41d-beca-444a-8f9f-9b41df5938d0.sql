
-- ai_config extras (Treinar IA)
ALTER TABLE public.ai_config
  ADD COLUMN IF NOT EXISTS business_description text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS payment_methods text,
  ADD COLUMN IF NOT EXISTS insurance_plans text,
  ADD COLUMN IF NOT EXISTS services text,
  ADD COLUMN IF NOT EXISTS differentials text,
  ADD COLUMN IF NOT EXISTS extra_notes text;

-- automations
ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS conditions jsonb NOT NULL DEFAULT '{}'::jsonb;

-- campaigns
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS message_body text,
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- appointments: title can be empty
ALTER TABLE public.appointments ALTER COLUMN title SET DEFAULT 'Consulta';
ALTER TABLE public.appointments ALTER COLUMN title DROP NOT NULL;

-- Lock down internal trigger functions (defense in depth)
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_template_aliases() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_automation_aliases() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_instance_name() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_message_body() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_ai_config_enabled() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_default_ai_config() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_instance_charge() FROM PUBLIC, anon, authenticated;
