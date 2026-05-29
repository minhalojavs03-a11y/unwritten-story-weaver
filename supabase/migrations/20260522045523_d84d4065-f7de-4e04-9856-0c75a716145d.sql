
-- Extend appointments with consórcio-specific and Google Calendar/Meet fields
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS consultant_member_id uuid REFERENCES public.tenant_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS meeting_type text DEFAULT 'simulacao',
  ADD COLUMN IF NOT EXISTS meet_link text,
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS google_calendar_id text,
  ADD COLUMN IF NOT EXISTS google_sync_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS google_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS outcome_notes text;

CREATE INDEX IF NOT EXISTS idx_appointments_consultant ON public.appointments(consultant_member_id);
CREATE INDEX IF NOT EXISTS idx_appointments_google_event ON public.appointments(google_event_id);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON public.appointments(scheduled_at);

-- Meeting recordings library (Google Meet recordings synced from Drive)
CREATE TABLE IF NOT EXISTS public.meeting_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  consultant_member_id uuid REFERENCES public.tenant_members(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  meeting_type text DEFAULT 'simulacao',
  recorded_at timestamptz NOT NULL DEFAULT now(),
  duration_seconds integer,
  -- Google Drive / Meet artifacts
  google_drive_file_id text,
  video_url text,
  thumbnail_url text,
  transcript_url text,
  -- Curation
  is_featured boolean NOT NULL DEFAULT false,
  is_training_pick boolean NOT NULL DEFAULT false,
  category text,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  view_count integer NOT NULL DEFAULT 0,
  -- Sync metadata
  source text NOT NULL DEFAULT 'manual',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recordings_tenant ON public.meeting_recordings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recordings_consultant ON public.meeting_recordings(consultant_member_id);
CREATE INDEX IF NOT EXISTS idx_recordings_lead ON public.meeting_recordings(lead_id);
CREATE INDEX IF NOT EXISTS idx_recordings_featured ON public.meeting_recordings(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_recordings_training ON public.meeting_recordings(is_training_pick) WHERE is_training_pick = true;

ALTER TABLE public.meeting_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view recordings"
  ON public.meeting_recordings FOR SELECT TO authenticated
  USING (is_tenant_staff(tenant_id));

CREATE POLICY "Staff create recordings"
  ON public.meeting_recordings FOR INSERT TO authenticated
  WITH CHECK (is_tenant_staff(tenant_id));

CREATE POLICY "Staff update recordings"
  ON public.meeting_recordings FOR UPDATE TO authenticated
  USING (is_tenant_staff(tenant_id))
  WITH CHECK (is_tenant_staff(tenant_id));

CREATE POLICY "Owners delete recordings"
  ON public.meeting_recordings FOR DELETE TO authenticated
  USING (is_tenant_owner(tenant_id));

CREATE POLICY "Superadmins manage all recordings"
  ON public.meeting_recordings FOR ALL TO authenticated
  USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));

CREATE TRIGGER update_recordings_updated_at
  BEFORE UPDATE ON public.meeting_recordings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Track recording views (so we can show "watched" indicators and curate trainees)
CREATE TABLE IF NOT EXISTS public.recording_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id uuid NOT NULL REFERENCES public.meeting_recordings(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  viewer_user_id uuid,
  viewer_member_id uuid REFERENCES public.tenant_members(id) ON DELETE SET NULL,
  watched_seconds integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recording_views_recording ON public.recording_views(recording_id);
CREATE INDEX IF NOT EXISTS idx_recording_views_user ON public.recording_views(viewer_user_id);

ALTER TABLE public.recording_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view recording_views"
  ON public.recording_views FOR SELECT TO authenticated
  USING (is_tenant_staff(tenant_id));

CREATE POLICY "Staff insert recording_views"
  ON public.recording_views FOR INSERT TO authenticated
  WITH CHECK (is_tenant_staff(tenant_id));

CREATE POLICY "Staff update own recording_views"
  ON public.recording_views FOR UPDATE TO authenticated
  USING (is_tenant_staff(tenant_id) AND (viewer_user_id = auth.uid() OR is_tenant_owner(tenant_id)))
  WITH CHECK (is_tenant_staff(tenant_id));

CREATE POLICY "Superadmins manage all recording_views"
  ON public.recording_views FOR ALL TO authenticated
  USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));

CREATE TRIGGER update_recording_views_updated_at
  BEFORE UPDATE ON public.recording_views
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Google integration settings (per tenant) — ready to receive OAuth tokens later
CREATE TABLE IF NOT EXISTS public.google_integration (
  tenant_id uuid PRIMARY KEY,
  is_connected boolean NOT NULL DEFAULT false,
  google_account_email text,
  calendar_id text DEFAULT 'primary',
  drive_recordings_folder_id text,
  auto_sync_calendar boolean NOT NULL DEFAULT true,
  auto_sync_recordings boolean NOT NULL DEFAULT true,
  last_calendar_sync_at timestamptz,
  last_recordings_sync_at timestamptz,
  last_sync_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_integration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view google_integration"
  ON public.google_integration FOR SELECT TO authenticated
  USING (is_tenant_staff(tenant_id));

CREATE POLICY "Owners manage google_integration"
  ON public.google_integration FOR ALL TO authenticated
  USING (is_tenant_owner(tenant_id)) WITH CHECK (is_tenant_owner(tenant_id));

CREATE POLICY "Superadmins manage google_integration"
  ON public.google_integration FOR ALL TO authenticated
  USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));

CREATE TRIGGER update_google_integration_updated_at
  BEFORE UPDATE ON public.google_integration
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
