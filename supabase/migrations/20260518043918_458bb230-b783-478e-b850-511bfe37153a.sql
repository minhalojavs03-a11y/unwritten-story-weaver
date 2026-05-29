
-- Add tone + enabled to ai_config
ALTER TABLE public.ai_config
  ADD COLUMN IF NOT EXISTS tone text DEFAULT 'amigavel',
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.sync_ai_config_enabled()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.is_active := COALESCE(NEW.enabled, NEW.is_active, true);
    NEW.enabled := NEW.is_active;
  ELSE
    IF NEW.enabled IS DISTINCT FROM OLD.enabled THEN NEW.is_active := NEW.enabled; END IF;
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN NEW.enabled := NEW.is_active; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_ai_config_sync
  BEFORE INSERT OR UPDATE ON public.ai_config
  FOR EACH ROW EXECUTE FUNCTION public.sync_ai_config_enabled();

-- business_hours
CREATE TABLE public.business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  open_time time,
  close_time time,
  is_closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, weekday)
);
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins manage all business_hours" ON public.business_hours
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Staff view business_hours" ON public.business_hours
  FOR SELECT TO authenticated USING (public.is_tenant_staff(tenant_id));
CREATE POLICY "Owners manage business_hours" ON public.business_hours
  FOR ALL TO authenticated
  USING (public.is_tenant_owner(tenant_id))
  WITH CHECK (public.is_tenant_owner(tenant_id));
CREATE TRIGGER trg_business_hours_updated BEFORE UPDATE ON public.business_hours
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- faqs
CREATE TABLE public.faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_faqs_tenant ON public.faqs(tenant_id, position);
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins manage all faqs" ON public.faqs
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Staff view faqs" ON public.faqs
  FOR SELECT TO authenticated USING (public.is_tenant_staff(tenant_id));
CREATE POLICY "Owners manage faqs" ON public.faqs
  FOR ALL TO authenticated
  USING (public.is_tenant_owner(tenant_id))
  WITH CHECK (public.is_tenant_owner(tenant_id));

-- knowledge_files
CREATE TABLE public.knowledge_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'doc',
  name text NOT NULL,
  storage_path text,
  url text,
  mime_type text,
  size_bytes bigint,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_knowledge_tenant ON public.knowledge_files(tenant_id);
CREATE INDEX idx_knowledge_kind ON public.knowledge_files(tenant_id, kind);
ALTER TABLE public.knowledge_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins manage all knowledge_files" ON public.knowledge_files
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Staff view knowledge_files" ON public.knowledge_files
  FOR SELECT TO authenticated USING (public.is_tenant_staff(tenant_id));
CREATE POLICY "Owners manage knowledge_files" ON public.knowledge_files
  FOR ALL TO authenticated
  USING (public.is_tenant_owner(tenant_id))
  WITH CHECK (public.is_tenant_owner(tenant_id));

-- Storage bucket for knowledge files
INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge', 'knowledge', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Staff read own knowledge bucket" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'knowledge'
    AND public.is_tenant_staff((storage.foldername(name))[1]::uuid)
  );
CREATE POLICY "Owners write own knowledge bucket" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'knowledge'
    AND public.is_tenant_owner((storage.foldername(name))[1]::uuid)
  );
CREATE POLICY "Owners delete own knowledge bucket" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'knowledge'
    AND public.is_tenant_owner((storage.foldername(name))[1]::uuid)
  );
