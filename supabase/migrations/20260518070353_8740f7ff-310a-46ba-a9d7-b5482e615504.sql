CREATE TABLE public.whatsapp_sellers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,
  whatsapp_instance_id uuid NOT NULL,
  user_id uuid,
  name text NOT NULL,
  phone text,
  notify_on_new_lead boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX whatsapp_sellers_tenant_phone_unique
  ON public.whatsapp_sellers (tenant_id, phone)
  WHERE phone IS NOT NULL;

CREATE INDEX whatsapp_sellers_tenant_idx ON public.whatsapp_sellers (tenant_id);
CREATE INDEX whatsapp_sellers_instance_idx ON public.whatsapp_sellers (whatsapp_instance_id);

ALTER TABLE public.whatsapp_sellers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage whatsapp_sellers"
  ON public.whatsapp_sellers FOR ALL TO authenticated
  USING (is_tenant_owner(tenant_id))
  WITH CHECK (is_tenant_owner(tenant_id));

CREATE POLICY "Staff view whatsapp_sellers"
  ON public.whatsapp_sellers FOR SELECT TO authenticated
  USING (is_tenant_staff(tenant_id));

CREATE POLICY "Superadmins manage all whatsapp_sellers"
  ON public.whatsapp_sellers FOR ALL TO authenticated
  USING (is_superadmin(auth.uid()))
  WITH CHECK (is_superadmin(auth.uid()));

CREATE TRIGGER update_whatsapp_sellers_updated_at
  BEFORE UPDATE ON public.whatsapp_sellers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();