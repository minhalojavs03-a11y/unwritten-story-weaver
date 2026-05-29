
CREATE TABLE public.tenant_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  label text NOT NULL,
  category text NOT NULL DEFAULT 'outro',
  identifier text,
  password text,
  url text,
  notes text,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage tenant_credentials" ON public.tenant_credentials
  FOR ALL TO authenticated USING (public.is_tenant_owner(tenant_id)) WITH CHECK (public.is_tenant_owner(tenant_id));
CREATE POLICY "Superadmins manage all tenant_credentials" ON public.tenant_credentials
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE TRIGGER trg_tenant_credentials_updated BEFORE UPDATE ON public.tenant_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
