CREATE TABLE public.lead_stage_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,
  lead_id uuid,
  lead_name text,
  member_id uuid,
  member_name text,
  label text NOT NULL,
  stage text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.lead_stage_events TO authenticated;
GRANT ALL ON public.lead_stage_events TO service_role;

ALTER TABLE public.lead_stage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read stage events"
ON public.lead_stage_events FOR SELECT TO authenticated
USING (public.is_tenant_member(auth.uid(), tenant_id) OR public.has_app_role(auth.uid(), 'superadmin'));

CREATE POLICY "tenant members insert stage events"
ON public.lead_stage_events FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id) OR public.has_app_role(auth.uid(), 'superadmin'));

CREATE INDEX idx_lead_stage_events_tenant_created ON public.lead_stage_events (tenant_id, created_at DESC);
CREATE INDEX idx_lead_stage_events_member ON public.lead_stage_events (member_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_stage_events;