
-- nilton_leads: tabela isolada para leads exclusivos do consultor Nilton (RS)
CREATE TABLE IF NOT EXISTS public.nilton_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id text UNIQUE NOT NULL,
  created_time timestamptz,
  ad_id text,
  ad_name text,
  adset_id text,
  adset_name text,
  campaign_id text,
  campaign_name text,
  form_id text,
  form_name text,
  is_organic boolean DEFAULT false,
  platform text,
  carta_value text,
  nome_completo text,
  lead_status text DEFAULT 'CREATED OK',
  status text NOT NULL DEFAULT 'novo',
  notes text,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nilton_leads_tenant ON public.nilton_leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_nilton_leads_assigned ON public.nilton_leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_nilton_leads_status ON public.nilton_leads(status);
CREATE INDEX IF NOT EXISTS idx_nilton_leads_created_time ON public.nilton_leads(created_time DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nilton_leads TO authenticated;
GRANT ALL ON public.nilton_leads TO service_role;

ALTER TABLE public.nilton_leads ENABLE ROW LEVEL SECURITY;

-- Helper: detecta se o usuário corrente é "Nilton" (por id ou nome)
CREATE OR REPLACE FUNCTION public.is_nilton_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id
      AND (
        lower(coalesce(username,'')) = 'nilton'
        OR lower(coalesce(display_name,'')) LIKE 'nilton%'
        OR lower(coalesce(full_name,'')) LIKE 'nilton%'
      )
  )
$$;

-- RLS policies
CREATE POLICY "nilton_leads superadmin all"
  ON public.nilton_leads FOR ALL TO authenticated
  USING (public.has_app_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (public.has_app_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "nilton_leads owner select"
  ON public.nilton_leads FOR SELECT TO authenticated
  USING (public.get_tenant_role(auth.uid(), tenant_id) = 'owner'::tenant_role);

CREATE POLICY "nilton_leads owner update"
  ON public.nilton_leads FOR UPDATE TO authenticated
  USING (public.get_tenant_role(auth.uid(), tenant_id) = 'owner'::tenant_role)
  WITH CHECK (public.get_tenant_role(auth.uid(), tenant_id) = 'owner'::tenant_role);

CREATE POLICY "nilton_leads nilton select"
  ON public.nilton_leads FOR SELECT TO authenticated
  USING (assigned_to = auth.uid() AND public.is_nilton_user(auth.uid()));

CREATE POLICY "nilton_leads nilton update"
  ON public.nilton_leads FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid() AND public.is_nilton_user(auth.uid()))
  WITH CHECK (assigned_to = auth.uid() AND public.is_nilton_user(auth.uid()));

-- Trigger updated_at
CREATE TRIGGER trg_nilton_leads_updated_at
  BEFORE UPDATE ON public.nilton_leads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- nilton_sync_log
CREATE TABLE IF NOT EXISTS public.nilton_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  rows_fetched int NOT NULL DEFAULT 0,
  rows_inserted int NOT NULL DEFAULT 0,
  rows_skipped int NOT NULL DEFAULT 0,
  error_message text,
  duration_ms int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_nilton_sync_log_ran_at ON public.nilton_sync_log(ran_at DESC);

GRANT SELECT ON public.nilton_sync_log TO authenticated;
GRANT ALL ON public.nilton_sync_log TO service_role;

ALTER TABLE public.nilton_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nilton_sync_log superadmin/owner select"
  ON public.nilton_sync_log FOR SELECT TO authenticated
  USING (
    public.has_app_role(auth.uid(), 'superadmin'::app_role)
    OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
               WHERE tm.user_id = auth.uid() AND tm.role = 'owner'::tenant_role)
  );

-- Enable pg_cron and pg_net for scheduled sync
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
