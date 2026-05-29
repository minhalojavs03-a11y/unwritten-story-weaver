-- 1. Campos de vendedor na instância
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS seller_user_id uuid,
  ADD COLUMN IF NOT EXISTS seller_name text,
  ADD COLUMN IF NOT EXISTS seller_phone text;

-- 2. Configurações de cobrança (uma por loja; valor padrão por instância)
CREATE TABLE IF NOT EXISTS public.billing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE,
  per_instance_amount numeric NOT NULL DEFAULT 99.00,
  currency text NOT NULL DEFAULT 'BRL',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner manage billing settings"
  ON public.billing_settings FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id() AND has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (tenant_id = current_tenant_id() AND has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "tenant select billing settings"
  ON public.billing_settings FOR SELECT TO authenticated
  USING (tenant_id = current_tenant_id() OR is_superadmin(auth.uid()));

CREATE POLICY "superadmin manage billing settings"
  ON public.billing_settings FOR ALL TO authenticated
  USING (is_superadmin(auth.uid()))
  WITH CHECK (is_superadmin(auth.uid()));

CREATE TRIGGER trg_billing_settings_updated
  BEFORE UPDATE ON public.billing_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Cobranças por instância
CREATE TABLE IF NOT EXISTS public.instance_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  whatsapp_instance_id uuid NOT NULL,
  seller_user_id uuid,
  seller_name text,
  seller_phone text,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'pending', -- pending | paid | canceled
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instance_charges_tenant ON public.instance_charges (tenant_id);
CREATE INDEX IF NOT EXISTS idx_instance_charges_instance ON public.instance_charges (whatsapp_instance_id);

ALTER TABLE public.instance_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant select instance charges"
  ON public.instance_charges FOR SELECT TO authenticated
  USING (tenant_id = current_tenant_id() OR is_superadmin(auth.uid()));

CREATE POLICY "superadmin manage instance charges"
  ON public.instance_charges FOR ALL TO authenticated
  USING (is_superadmin(auth.uid()))
  WITH CHECK (is_superadmin(auth.uid()));

CREATE POLICY "owner insert instance charges"
  ON public.instance_charges FOR INSERT TO authenticated
  WITH CHECK (tenant_id = current_tenant_id() AND has_role(auth.uid(), 'owner'::app_role));

-- 4. Trigger: ao criar instância, cria cobrança automaticamente
CREATE OR REPLACE FUNCTION public.create_charge_for_new_instance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric;
  v_currency text;
BEGIN
  -- garante config existente
  INSERT INTO public.billing_settings (tenant_id)
  VALUES (NEW.tenant_id)
  ON CONFLICT (tenant_id) DO NOTHING;

  SELECT per_instance_amount, currency INTO v_amount, v_currency
  FROM public.billing_settings WHERE tenant_id = NEW.tenant_id;

  INSERT INTO public.instance_charges (
    tenant_id, whatsapp_instance_id, seller_user_id, seller_name, seller_phone,
    amount, currency, status
  ) VALUES (
    NEW.tenant_id, NEW.id, NEW.seller_user_id, NEW.seller_name, NEW.seller_phone,
    COALESCE(v_amount, 0), COALESCE(v_currency, 'BRL'), 'pending'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_instance_charge_on_insert ON public.whatsapp_instances;
CREATE TRIGGER trg_instance_charge_on_insert
  AFTER INSERT ON public.whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION public.create_charge_for_new_instance();