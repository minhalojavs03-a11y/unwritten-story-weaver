
-- ============ leads: novas colunas ============
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS interest TEXT,
  ADD COLUMN IF NOT EXISTS sheet_row_index INTEGER,
  ADD COLUMN IF NOT EXISTS imported_from_sheet BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assigned_to UUID;

-- ============ profiles: telefone ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- ============ sheet_sync_config ============
CREATE TABLE IF NOT EXISTS public.sheet_sync_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  sheet_url TEXT NOT NULL,
  sheet_id TEXT NOT NULL,
  tab_name TEXT NOT NULL DEFAULT 'Sheet1',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT DEFAULT 'pending',
  last_sync_error TEXT,
  last_row_synced INTEGER NOT NULL DEFAULT 1,
  header_row INTEGER NOT NULL DEFAULT 1,
  column_mapping JSONB NOT NULL DEFAULT '{"nome":"A","telefone":"B","email":"C","interesse":"D"}'::jsonb,
  notify_vendors BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sheet_sync_config ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_sheet_sync_config_updated_at
  BEFORE UPDATE ON public.sheet_sync_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Superadmins manage all sheet_sync_config"
  ON public.sheet_sync_config FOR ALL TO authenticated
  USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));
CREATE POLICY "Owners manage sheet_sync_config"
  ON public.sheet_sync_config FOR ALL TO authenticated
  USING (is_tenant_owner(tenant_id)) WITH CHECK (is_tenant_owner(tenant_id));
CREATE POLICY "Staff view sheet_sync_config"
  ON public.sheet_sync_config FOR SELECT TO authenticated
  USING (is_tenant_staff(tenant_id));

-- ============ sheet_imported_rows ============
CREATE TABLE IF NOT EXISTS public.sheet_imported_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  sheet_sync_config_id UUID NOT NULL REFERENCES public.sheet_sync_config(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  lead_id UUID,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sheet_sync_config_id, row_index)
);
ALTER TABLE public.sheet_imported_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage all sheet_imported_rows"
  ON public.sheet_imported_rows FOR ALL TO authenticated
  USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));
CREATE POLICY "Staff view sheet_imported_rows"
  ON public.sheet_imported_rows FOR SELECT TO authenticated
  USING (is_tenant_staff(tenant_id));

-- ============ sheet_sync_logs ============
CREATE TABLE IF NOT EXISTS public.sheet_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  sheet_sync_config_id UUID REFERENCES public.sheet_sync_config(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  summary TEXT,
  error_message TEXT,
  new_leads_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sheet_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sheet_sync_logs_tenant_created
  ON public.sheet_sync_logs (tenant_id, created_at DESC);

CREATE POLICY "Superadmins manage all sheet_sync_logs"
  ON public.sheet_sync_logs FOR ALL TO authenticated
  USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));
CREATE POLICY "Staff view sheet_sync_logs"
  ON public.sheet_sync_logs FOR SELECT TO authenticated
  USING (is_tenant_staff(tenant_id));

-- ============ lead_notifications ============
CREATE TABLE IF NOT EXISTS public.lead_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  lead_id UUID,
  type TEXT NOT NULL,
  recipient_user_id UUID,
  recipient_phone TEXT,
  message_sent TEXT,
  delivered BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage all lead_notifications"
  ON public.lead_notifications FOR ALL TO authenticated
  USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));
CREATE POLICY "Staff view lead_notifications"
  ON public.lead_notifications FOR SELECT TO authenticated
  USING (is_tenant_staff(tenant_id));

-- ============ Realtime ============
ALTER TABLE public.leads REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
