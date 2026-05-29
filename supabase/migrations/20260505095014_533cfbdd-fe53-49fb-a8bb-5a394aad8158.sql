
-- 1) Estende ai_config com campos estruturados de negócio
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

-- 2) Horários de funcionamento
CREATE TABLE IF NOT EXISTS public.business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  open_time text,
  close_time text,
  closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, weekday)
);
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant select bh" ON public.business_hours FOR SELECT TO authenticated USING (tenant_id = current_tenant_id() OR is_superadmin(auth.uid()));
CREATE POLICY "owner manage bh" ON public.business_hours FOR ALL TO authenticated USING (tenant_id = current_tenant_id() AND has_role(auth.uid(),'owner'::app_role)) WITH CHECK (tenant_id = current_tenant_id() AND has_role(auth.uid(),'owner'::app_role));

-- 3) FAQs
CREATE TABLE IF NOT EXISTS public.faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant select faq" ON public.faqs FOR SELECT TO authenticated USING (tenant_id = current_tenant_id() OR is_superadmin(auth.uid()));
CREATE POLICY "owner manage faq" ON public.faqs FOR ALL TO authenticated USING (tenant_id = current_tenant_id() AND has_role(auth.uid(),'owner'::app_role)) WITH CHECK (tenant_id = current_tenant_id() AND has_role(auth.uid(),'owner'::app_role));

-- 4) Arquivos da base de conhecimento (Excel/CSV/TXT/PDF + imagens da galeria)
CREATE TABLE IF NOT EXISTS public.knowledge_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'document', -- 'document' | 'image' | 'product_list'
  name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  extracted_text text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.knowledge_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant select kf" ON public.knowledge_files FOR SELECT TO authenticated USING (tenant_id = current_tenant_id() OR is_superadmin(auth.uid()));
CREATE POLICY "tenant insert kf" ON public.knowledge_files FOR INSERT TO authenticated WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "owner delete kf" ON public.knowledge_files FOR DELETE TO authenticated USING (tenant_id = current_tenant_id() AND has_role(auth.uid(),'owner'::app_role));

-- 5) Bucket público para os arquivos de conhecimento
INSERT INTO storage.buckets (id, name, public) VALUES ('knowledge', 'knowledge', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "knowledge public read" ON storage.objects FOR SELECT USING (bucket_id = 'knowledge');
CREATE POLICY "tenant upload knowledge" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'knowledge' AND auth.uid() IS NOT NULL);
CREATE POLICY "tenant delete knowledge" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'knowledge' AND auth.uid() IS NOT NULL);
