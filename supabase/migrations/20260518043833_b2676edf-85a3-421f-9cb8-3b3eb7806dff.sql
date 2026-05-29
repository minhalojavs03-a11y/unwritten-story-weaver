
-- ============================================================
-- MIGRATION 3: Compatibility columns + final tables
-- ============================================================

-- ---------- LEADS extras ----------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS temperature text DEFAULT 'cold',
  ADD COLUMN IF NOT EXISTS stage text DEFAULT 'novo',
  ADD COLUMN IF NOT EXISTS last_interaction_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz;

-- ---------- TEMPLATES extras ----------
-- Make existing required columns nullable so inserts using title/body work
ALTER TABLE public.templates
  ALTER COLUMN name DROP NOT NULL,
  ALTER COLUMN content DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS is_global boolean NOT NULL DEFAULT false;

-- Keep title<->name and body<->content in sync via trigger
CREATE OR REPLACE FUNCTION public.sync_template_aliases()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.title IS NULL AND NEW.name IS NOT NULL THEN NEW.title := NEW.name; END IF;
  IF NEW.name IS NULL AND NEW.title IS NOT NULL THEN NEW.name := NEW.title; END IF;
  IF NEW.body IS NULL AND NEW.content IS NOT NULL THEN NEW.body := NEW.content; END IF;
  IF NEW.content IS NULL AND NEW.body IS NOT NULL THEN NEW.content := NEW.body; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_templates_sync
  BEFORE INSERT OR UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.sync_template_aliases();

-- Allow tenant_id NULL for global templates
ALTER TABLE public.templates ALTER COLUMN tenant_id DROP NOT NULL;
DROP POLICY IF EXISTS "Staff view templates" ON public.templates;
CREATE POLICY "Staff view templates" ON public.templates
  FOR SELECT TO authenticated
  USING (is_global = true OR public.is_tenant_staff(tenant_id) OR public.is_superadmin(auth.uid()));

-- ---------- AUTOMATIONS extras ----------
ALTER TABLE public.automations
  ALTER COLUMN trigger_type DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS trigger text,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.sync_automation_aliases()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.trigger IS NULL AND NEW.trigger_type IS NOT NULL THEN NEW.trigger := NEW.trigger_type; END IF;
  IF NEW.trigger_type IS NULL AND NEW.trigger IS NOT NULL THEN NEW.trigger_type := NEW.trigger; END IF;
  -- active <-> is_active
  IF TG_OP = 'INSERT' THEN
    NEW.is_active := COALESCE(NEW.active, NEW.is_active, true);
    NEW.active := NEW.is_active;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.active IS DISTINCT FROM OLD.active THEN NEW.is_active := NEW.active; END IF;
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN NEW.active := NEW.is_active; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_automations_sync
  BEFORE INSERT OR UPDATE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.sync_automation_aliases();

-- ---------- WHATSAPP_INSTANCES extras ----------
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS instance_name text,
  ADD COLUMN IF NOT EXISTS seller_name text,
  ADD COLUMN IF NOT EXISTS seller_phone text;

-- Sync instance_name <-> name
CREATE OR REPLACE FUNCTION public.sync_instance_name()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.instance_name IS NULL AND NEW.name IS NOT NULL THEN NEW.instance_name := NEW.name; END IF;
  IF NEW.name IS NULL AND NEW.instance_name IS NOT NULL THEN NEW.name := NEW.instance_name; END IF;
  RETURN NEW;
END $$;
ALTER TABLE public.whatsapp_instances ALTER COLUMN name DROP NOT NULL;
CREATE TRIGGER trg_whatsapp_instances_sync
  BEFORE INSERT OR UPDATE ON public.whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION public.sync_instance_name();

-- ---------- CONVERSATIONS extras ----------
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS last_message_preview text;

-- ---------- MESSAGES extras ----------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS body text;

CREATE OR REPLACE FUNCTION public.sync_message_body()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.body IS NULL AND NEW.content IS NOT NULL THEN NEW.body := NEW.content; END IF;
  IF NEW.content IS NULL AND NEW.body IS NOT NULL THEN NEW.content := NEW.body; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_messages_sync
  BEFORE INSERT OR UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.sync_message_body();

-- ---------- APPOINTMENTS extras ----------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS type text;

-- ============================================================
-- NEW TABLE: ai_config
-- ============================================================
CREATE TABLE public.ai_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  temperature numeric(3,2) NOT NULL DEFAULT 0.7,
  system_prompt text,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage all ai_config" ON public.ai_config
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Staff view ai_config" ON public.ai_config
  FOR SELECT TO authenticated USING (public.is_tenant_staff(tenant_id));
CREATE POLICY "Owners manage ai_config" ON public.ai_config
  FOR ALL TO authenticated
  USING (public.is_tenant_owner(tenant_id))
  WITH CHECK (public.is_tenant_owner(tenant_id));

CREATE TRIGGER trg_ai_config_updated BEFORE UPDATE ON public.ai_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create ai_config when tenant is created
CREATE OR REPLACE FUNCTION public.create_default_ai_config()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.ai_config (tenant_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_tenant_ai_config AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.create_default_ai_config();

-- ============================================================
-- NEW TABLE: billing_settings
-- ============================================================
CREATE TABLE public.billing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  per_instance_amount numeric(10,2) NOT NULL DEFAULT 99,
  currency text NOT NULL DEFAULT 'BRL',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage all billing_settings" ON public.billing_settings
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Staff view billing_settings" ON public.billing_settings
  FOR SELECT TO authenticated USING (public.is_tenant_staff(tenant_id));

CREATE TRIGGER trg_billing_settings_updated BEFORE UPDATE ON public.billing_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- NEW TABLE: instance_charges
-- ============================================================
CREATE TABLE public.instance_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  whatsapp_instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  seller_name text,
  seller_phone text,
  amount numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'pending',
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_instance_charges_tenant ON public.instance_charges(tenant_id);
ALTER TABLE public.instance_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage all instance_charges" ON public.instance_charges
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Staff view instance_charges" ON public.instance_charges
  FOR SELECT TO authenticated USING (public.is_tenant_staff(tenant_id));

-- Auto-create charge when whatsapp_instance is created
CREATE OR REPLACE FUNCTION public.create_instance_charge()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _amount numeric; _currency text;
BEGIN
  SELECT per_instance_amount, currency INTO _amount, _currency
  FROM public.billing_settings WHERE tenant_id = NEW.tenant_id;
  IF _amount IS NULL THEN _amount := 99; _currency := 'BRL'; END IF;
  INSERT INTO public.instance_charges (tenant_id, whatsapp_instance_id, seller_name, seller_phone, amount, currency, status)
  VALUES (NEW.tenant_id, NEW.id, NEW.seller_name, NEW.seller_phone, _amount, _currency, 'pending');
  RETURN NEW;
END $$;
CREATE TRIGGER trg_whatsapp_charge AFTER INSERT ON public.whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION public.create_instance_charge();
