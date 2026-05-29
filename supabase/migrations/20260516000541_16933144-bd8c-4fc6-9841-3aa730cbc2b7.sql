
CREATE TABLE IF NOT EXISTS public.whatsapp_sellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  whatsapp_instance_id uuid NOT NULL,
  user_id uuid NULL,
  name text NOT NULL,
  phone text NULL,
  notify_on_new_lead boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sellers_tenant ON public.whatsapp_sellers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sellers_instance ON public.whatsapp_sellers(whatsapp_instance_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_sellers_phone ON public.whatsapp_sellers(tenant_id, whatsapp_instance_id, phone) WHERE phone IS NOT NULL;

ALTER TABLE public.whatsapp_sellers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant select sellers" ON public.whatsapp_sellers
  FOR SELECT TO authenticated
  USING ((tenant_id = current_tenant_id()) OR is_superadmin(auth.uid()));

CREATE POLICY "owner manage sellers" ON public.whatsapp_sellers
  FOR ALL TO authenticated
  USING ((tenant_id = current_tenant_id()) AND has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK ((tenant_id = current_tenant_id()) AND has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "superadmin manage sellers" ON public.whatsapp_sellers
  FOR ALL TO authenticated
  USING (is_superadmin(auth.uid()))
  WITH CHECK (is_superadmin(auth.uid()));

CREATE TRIGGER trg_whatsapp_sellers_updated_at
  BEFORE UPDATE ON public.whatsapp_sellers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
