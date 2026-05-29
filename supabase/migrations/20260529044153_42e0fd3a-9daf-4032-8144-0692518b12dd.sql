
-- ============================================================
-- FERACON CRM — Recriação completa do esquema (39 tabelas)
-- ============================================================

-- ---------- 1. ALTER em tabelas existentes ----------

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS role_label text,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS monthly_goal integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notification_whatsapp boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notification_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS pin_hash text,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key ON public.profiles (lower(username)) WHERE username IS NOT NULL;

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- ---------- 2. Helper genérico tenant-member ----------
-- (is_tenant_member já existe em tenant_memberships; criar variante para tenant_members internos)

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid() LIMIT 1
$$;

-- ---------- 3. Tabelas Multi-tenant adicionais ----------

CREATE TABLE IF NOT EXISTS public.tenant_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  label text NOT NULL,
  category text NOT NULL DEFAULT 'outro',
  identifier text, password text, url text, notes text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_credentials TO authenticated;
GRANT ALL ON public.tenant_credentials TO service_role;
ALTER TABLE public.tenant_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_credentials_all ON public.tenant_credentials FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  username text NOT NULL,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  role_label text,
  avatar_color text NOT NULL DEFAULT '#1E40AF',
  is_active boolean NOT NULL DEFAULT true,
  max_credit_value numeric,
  phone text, avatar_url text, full_name text, email text, bio text,
  monthly_goal integer NOT NULL DEFAULT 0,
  notification_whatsapp boolean NOT NULL DEFAULT true,
  notification_email boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz,
  receives_leads boolean NOT NULL DEFAULT true,
  daily_lead_limit integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, username)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_members TO authenticated;
GRANT ALL ON public.tenant_members TO service_role;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_members_all ON public.tenant_members FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  email text NOT NULL,
  role public.tenant_role NOT NULL,
  role_label text,
  display_name text,
  token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_invites TO authenticated;
GRANT SELECT ON public.team_invites TO anon;
GRANT ALL ON public.team_invites TO service_role;
ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_invites_read ON public.team_invites FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY team_invites_write ON public.team_invites FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY team_invites_update ON public.team_invites FOR UPDATE TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY team_invites_delete ON public.team_invites FOR DELETE TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));

-- ---------- 4. Leads & Pipeline ----------

CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text, phone text, email text, source text,
  status text NOT NULL DEFAULT 'new',
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  score integer NOT NULL DEFAULT 0,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_contact_at timestamptz,
  temperature text DEFAULT 'cold',
  stage text DEFAULT 'novo',
  last_interaction_at timestamptz,
  last_message_at timestamptz,
  interest text,
  sheet_row_index integer,
  imported_from_sheet boolean NOT NULL DEFAULT false,
  assigned_to uuid,
  whatsapp_instance_id uuid,
  assigned_member_id uuid,
  assigned_member_at timestamptz,
  contact_attempts smallint NOT NULL DEFAULT 0,
  qualification_status text,
  lead_phase text,
  opportunity_type text,
  disqualification_reason text,
  next_followup_at timestamptz,
  credit_value numeric,
  asset_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY leads_all ON public.leads FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.lead_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  lead_id uuid,
  type text NOT NULL,
  recipient_user_id uuid,
  recipient_phone text,
  message_sent text,
  delivered boolean NOT NULL DEFAULT false,
  sent_at timestamptz NOT NULL DEFAULT now(),
  recipient_member_id uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_notifications TO authenticated;
GRANT ALL ON public.lead_notifications TO service_role;
ALTER TABLE public.lead_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_notifications_all ON public.lead_notifications FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.lead_transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  requester_member_id uuid NOT NULL,
  owner_member_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  message text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_transfer_requests TO authenticated;
GRANT ALL ON public.lead_transfer_requests TO service_role;
ALTER TABLE public.lead_transfer_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_transfer_all ON public.lead_transfer_requests FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- ---------- 5. Conversas & Mensagens ----------

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  lead_id uuid,
  whatsapp_instance_id uuid,
  channel text NOT NULL DEFAULT 'whatsapp',
  status text NOT NULL DEFAULT 'open',
  assigned_to uuid,
  last_message_at timestamptz,
  unread_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_message_preview text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY conversations_all ON public.conversations FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid,
  lead_id uuid,
  direction text NOT NULL,
  message_type text NOT NULL DEFAULT 'text',
  content text,
  body text,
  media_url text,
  status text NOT NULL DEFAULT 'sent',
  external_id text,
  sent_by uuid,
  whatsapp_instance_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY messages_all ON public.messages FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  name text, title text,
  content text, body text,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  category text,
  is_active boolean NOT NULL DEFAULT true,
  is_global boolean NOT NULL DEFAULT false,
  created_by_member_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.templates TO authenticated;
GRANT ALL ON public.templates TO service_role;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY templates_select ON public.templates FOR SELECT TO authenticated
  USING (is_global OR public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY templates_write ON public.templates FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY templates_update ON public.templates FOR UPDATE TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY templates_delete ON public.templates FOR DELETE TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

-- ---------- 6. WhatsApp ----------

CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text,
  status text NOT NULL DEFAULT 'disconnected',
  token text, instance_id text, qr_code text,
  phone_number text, webhook_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  instance_name text, seller_name text, seller_phone text,
  server_url text, instance_token text,
  is_connected boolean NOT NULL DEFAULT false,
  last_connection_at timestamptz,
  device_name text NOT NULL DEFAULT 'Bot',
  webhook_secret text NOT NULL DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  seller_user_id uuid,
  created_by_user_id uuid,
  phone_label text,
  connected_agents_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_instances TO authenticated;
GRANT ALL ON public.whatsapp_instances TO service_role;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_instances_all ON public.whatsapp_instances FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.whatsapp_sellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  whatsapp_instance_id uuid NOT NULL,
  user_id uuid,
  name text NOT NULL,
  phone text,
  notify_on_new_lead boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_sellers TO authenticated;
GRANT ALL ON public.whatsapp_sellers TO service_role;
ALTER TABLE public.whatsapp_sellers ENABLE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_sellers_all ON public.whatsapp_sellers FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.whatsapp_silence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  whatsapp_instance_id uuid,
  phone text NOT NULL,
  silenced_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_silence TO authenticated;
GRANT ALL ON public.whatsapp_silence TO service_role;
ALTER TABLE public.whatsapp_silence ENABLE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_silence_all ON public.whatsapp_silence FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- ---------- 7. Agendamentos & Reuniões ----------

CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  lead_id uuid,
  title text DEFAULT 'Consulta',
  description text,
  scheduled_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'scheduled',
  service text, notes text,
  created_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  type text,
  consultant_member_id uuid,
  meeting_type text DEFAULT 'simulacao',
  meet_link text,
  google_event_id text,
  google_calendar_id text,
  google_sync_status text DEFAULT 'pending',
  google_synced_at timestamptz,
  attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
  outcome text, outcome_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY appointments_all ON public.appointments FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.meeting_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  appointment_id uuid,
  lead_id uuid,
  consultant_member_id uuid,
  title text NOT NULL,
  description text,
  meeting_type text DEFAULT 'simulacao',
  recorded_at timestamptz NOT NULL DEFAULT now(),
  duration_seconds integer,
  google_drive_file_id text,
  video_url text, thumbnail_url text, transcript_url text,
  is_featured boolean NOT NULL DEFAULT false,
  is_training_pick boolean NOT NULL DEFAULT false,
  category text,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  view_count integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_recordings TO authenticated;
GRANT ALL ON public.meeting_recordings TO service_role;
ALTER TABLE public.meeting_recordings ENABLE ROW LEVEL SECURITY;
CREATE POLICY meeting_recordings_all ON public.meeting_recordings FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.recording_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  viewer_user_id uuid,
  viewer_member_id uuid,
  watched_seconds integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recording_views TO authenticated;
GRANT ALL ON public.recording_views TO service_role;
ALTER TABLE public.recording_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY recording_views_all ON public.recording_views FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- ---------- 8. IA & Coaching ----------

CREATE TABLE IF NOT EXISTS public.ai_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  temperature numeric NOT NULL DEFAULT 0.7,
  system_prompt text,
  is_active boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  tone text DEFAULT 'amigavel',
  business_description text, address text, phone text, whatsapp text, website text,
  payment_methods text, insurance_plans text, services text, differentials text, extra_notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_config TO authenticated;
GRANT ALL ON public.ai_config TO service_role;
ALTER TABLE public.ai_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_config_all ON public.ai_config FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.coaching_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  lead_id uuid, member_id uuid, message_id uuid,
  insight_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  detail text, signal_quote text, consultant_quote text, suggestion text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz, resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coaching_insights TO authenticated;
GRANT ALL ON public.coaching_insights TO service_role;
ALTER TABLE public.coaching_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY coaching_insights_all ON public.coaching_insights FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.coaching_message_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  message_id uuid NOT NULL,
  conversation_id uuid,
  status text NOT NULL DEFAULT 'processed',
  inserted_count integer NOT NULL DEFAULT 0,
  clean_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  error_message text,
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coaching_message_analysis TO authenticated;
GRANT ALL ON public.coaching_message_analysis TO service_role;
ALTER TABLE public.coaching_message_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY coaching_msg_all ON public.coaching_message_analysis FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.knowledge_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'doc',
  name text NOT NULL,
  storage_path text, url text, mime_type text,
  size_bytes bigint, description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_files TO authenticated;
GRANT ALL ON public.knowledge_files TO service_role;
ALTER TABLE public.knowledge_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_files_all ON public.knowledge_files FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faqs TO authenticated;
GRANT ALL ON public.faqs TO service_role;
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;
CREATE POLICY faqs_all ON public.faqs FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- ---------- 9. Gamificação ----------

CREATE TABLE IF NOT EXISTS public.gamification_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  points_lead_assumed integer NOT NULL DEFAULT 5,
  points_contact_made integer NOT NULL DEFAULT 2,
  points_meeting_scheduled integer NOT NULL DEFAULT 20,
  points_sale_closed integer NOT NULL DEFAULT 100,
  points_fast_response_bonus integer NOT NULL DEFAULT 5,
  points_lead_lost integer NOT NULL DEFAULT -10,
  points_simulation_sent integer NOT NULL DEFAULT 30,
  fast_response_threshold_seconds integer NOT NULL DEFAULT 300,
  commission_per_sale numeric NOT NULL DEFAULT 0,
  levels jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gamification_config TO authenticated;
GRANT ALL ON public.gamification_config TO service_role;
ALTER TABLE public.gamification_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY gam_config_all ON public.gamification_config FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.gamification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  member_id uuid NOT NULL,
  event_type text NOT NULL,
  points integer NOT NULL DEFAULT 0,
  lead_id uuid, appointment_id uuid, message_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gamification_events TO authenticated;
GRANT ALL ON public.gamification_events TO service_role;
ALTER TABLE public.gamification_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY gam_events_all ON public.gamification_events FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.gamification_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  member_id uuid,
  period text NOT NULL,
  metric text NOT NULL,
  target_value numeric NOT NULL DEFAULT 0,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gamification_goals TO authenticated;
GRANT ALL ON public.gamification_goals TO service_role;
ALTER TABLE public.gamification_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY gam_goals_all ON public.gamification_goals FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.gamification_goal_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  member_id uuid NOT NULL,
  period text NOT NULL,
  metric text NOT NULL,
  target_value numeric NOT NULL,
  achieved_value numeric NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gamification_goal_history TO authenticated;
GRANT ALL ON public.gamification_goal_history TO service_role;
ALTER TABLE public.gamification_goal_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY gam_goal_hist_all ON public.gamification_goal_history FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.gamification_streaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  member_id uuid NOT NULL,
  current_streak integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  last_active_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gamification_streaks TO authenticated;
GRANT ALL ON public.gamification_streaks TO service_role;
ALTER TABLE public.gamification_streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY gam_streaks_all ON public.gamification_streaks FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- ---------- 10. Importação Sheets ----------

CREATE TABLE IF NOT EXISTS public.sheet_sync_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  sheet_url text NOT NULL,
  sheet_id text NOT NULL,
  tab_name text NOT NULL DEFAULT 'Sheet1',
  is_active boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  last_sync_status text DEFAULT 'pending',
  last_sync_error text,
  last_row_synced integer NOT NULL DEFAULT 1,
  header_row integer NOT NULL DEFAULT 1,
  column_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  notify_vendors boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sheet_sync_config TO authenticated;
GRANT ALL ON public.sheet_sync_config TO service_role;
ALTER TABLE public.sheet_sync_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY sheet_sync_cfg_all ON public.sheet_sync_config FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.sheet_imported_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  sheet_sync_config_id uuid NOT NULL,
  row_index integer NOT NULL,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  lead_id uuid,
  imported_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sheet_imported_rows TO authenticated;
GRANT ALL ON public.sheet_imported_rows TO service_role;
ALTER TABLE public.sheet_imported_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY sheet_imp_rows_all ON public.sheet_imported_rows FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.sheet_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  sheet_sync_config_id uuid,
  status text NOT NULL,
  summary text, error_message text,
  new_leads_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sheet_sync_logs TO authenticated;
GRANT ALL ON public.sheet_sync_logs TO service_role;
ALTER TABLE public.sheet_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY sheet_sync_logs_all ON public.sheet_sync_logs FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- ---------- 11. Automações & Campanhas ----------

CREATE TABLE IF NOT EXISTS public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  trigger text,
  trigger_type text,
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automations TO authenticated;
GRANT ALL ON public.automations TO service_role;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY automations_all ON public.automations FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  template_id uuid,
  whatsapp_instance_id uuid,
  audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  read_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  message_body text,
  created_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY campaigns_all ON public.campaigns FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  lead_id uuid,
  type text NOT NULL,
  due_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  processed_at timestamptz,
  recipient_phone text,
  message_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_queue TO authenticated;
GRANT ALL ON public.notification_queue TO service_role;
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY notif_queue_all ON public.notification_queue FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- ---------- 12. Financeiro & Produtos ----------

CREATE TABLE IF NOT EXISTS public.billing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  per_instance_amount numeric NOT NULL DEFAULT 99,
  currency text NOT NULL DEFAULT 'BRL',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_settings TO authenticated;
GRANT ALL ON public.billing_settings TO service_role;
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_all ON public.billing_settings FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.instance_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  whatsapp_instance_id uuid,
  seller_name text, seller_phone text,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'pending',
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instance_charges TO authenticated;
GRANT ALL ON public.instance_charges TO service_role;
ALTER TABLE public.instance_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY instance_charges_all ON public.instance_charges FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  price numeric,
  currency text NOT NULL DEFAULT 'BRL',
  category text,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY products_all ON public.products FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- ---------- 13. Outros ----------

CREATE TABLE IF NOT EXISTS public.business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  weekday smallint NOT NULL,
  open_time time, close_time time,
  is_closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_hours TO authenticated;
GRANT ALL ON public.business_hours TO service_role;
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY business_hours_all ON public.business_hours FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_integration TO authenticated;
GRANT ALL ON public.google_integration TO service_role;
ALTER TABLE public.google_integration ENABLE ROW LEVEL SECURITY;
CREATE POLICY google_int_all ON public.google_integration FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- ---------- 14. RPCs stub que o código precisa ----------

CREATE OR REPLACE FUNCTION public.check_username_available(_username text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(_username))
$$;

CREATE OR REPLACE FUNCTION public.complete_onboarding(_username text, _display_name text, _pin text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF length(_pin) < 4 OR length(_pin) > 6 THEN RAISE EXCEPTION 'pin must be 4-6 digits'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(_username) AND id <> auth.uid()) THEN
    RAISE EXCEPTION 'username already taken';
  END IF;
  UPDATE public.profiles
    SET username = _username,
        display_name = _display_name,
        pin_hash = extensions.crypt(_pin, extensions.gen_salt('bf')),
        onboarding_completed = true,
        updated_at = now()
    WHERE id = auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public.touch_my_last_seen()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.profiles SET last_seen_at = now() WHERE id = auth.uid();
  UPDATE public.tenant_memberships SET last_seen_at = now() WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.assume_lead(_lead_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.leads SET assigned_to = auth.uid(), assigned_member_at = now(), updated_at = now()
  WHERE id = _lead_id AND public.is_tenant_member(auth.uid(), tenant_id);
END $$;

CREATE OR REPLACE FUNCTION public.release_lead(_lead_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.leads SET assigned_to = NULL, assigned_member_id = NULL, assigned_member_at = NULL, updated_at = now()
  WHERE id = _lead_id AND public.is_tenant_member(auth.uid(), tenant_id);
END $$;

CREATE OR REPLACE FUNCTION public.set_ai_pre_attendance(_lead_id uuid, _enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.leads
    SET metadata = jsonb_set(coalesce(metadata,'{}'::jsonb), '{ai_pre_attendance}', to_jsonb(_enabled), true),
        updated_at = now()
    WHERE id = _lead_id AND public.is_tenant_member(auth.uid(), tenant_id);
END $$;

CREATE OR REPLACE FUNCTION public.update_my_tenant_member(_data jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles
    SET display_name = coalesce(_data->>'display_name', display_name),
        full_name = coalesce(_data->>'full_name', full_name),
        phone = coalesce(_data->>'phone', phone),
        bio = coalesce(_data->>'bio', bio),
        avatar_url = coalesce(_data->>'avatar_url', avatar_url),
        avatar_color = coalesce(_data->>'avatar_color', avatar_color),
        monthly_goal = coalesce((_data->>'monthly_goal')::int, monthly_goal),
        notification_whatsapp = coalesce((_data->>'notification_whatsapp')::bool, notification_whatsapp),
        notification_email = coalesce((_data->>'notification_email')::bool, notification_email),
        updated_at = now()
    WHERE id = auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public.list_tenant_members_public(_tenant_id uuid)
RETURNS TABLE(id uuid, username text, display_name text, role_label text, avatar_color text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, username, display_name, role_label, avatar_color, avatar_url
  FROM public.tenant_members
  WHERE tenant_id = _tenant_id AND is_active = true
$$;

CREATE OR REPLACE FUNCTION public.gamification_ranking(_tenant_id uuid, _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL)
RETURNS TABLE(member_id uuid, display_name text, avatar_color text, points bigint, events bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.display_name, m.avatar_color,
         coalesce(sum(e.points),0)::bigint AS points,
         count(e.id)::bigint AS events
  FROM public.tenant_members m
  LEFT JOIN public.gamification_events e ON e.member_id = m.id
    AND e.tenant_id = _tenant_id
    AND (_from IS NULL OR e.occurred_at >= _from)
    AND (_to   IS NULL OR e.occurred_at <= _to)
  WHERE m.tenant_id = _tenant_id
  GROUP BY m.id ORDER BY points DESC
$$;

CREATE OR REPLACE FUNCTION public.gamification_member_summary(_member_id uuid)
RETURNS TABLE(points bigint, events bigint, current_streak integer, best_streak integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    coalesce((SELECT sum(points) FROM public.gamification_events WHERE member_id = _member_id),0)::bigint,
    coalesce((SELECT count(*) FROM public.gamification_events WHERE member_id = _member_id),0)::bigint,
    coalesce((SELECT current_streak FROM public.gamification_streaks WHERE member_id = _member_id LIMIT 1),0),
    coalesce((SELECT best_streak FROM public.gamification_streaks WHERE member_id = _member_id LIMIT 1),0)
$$;

CREATE OR REPLACE FUNCTION public.gamification_team_overview(_tenant_id uuid)
RETURNS TABLE(total_points bigint, total_events bigint, active_members bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    coalesce((SELECT sum(points) FROM public.gamification_events WHERE tenant_id = _tenant_id),0)::bigint,
    coalesce((SELECT count(*) FROM public.gamification_events WHERE tenant_id = _tenant_id),0)::bigint,
    (SELECT count(*) FROM public.tenant_members WHERE tenant_id = _tenant_id AND is_active = true)::bigint
$$;

CREATE OR REPLACE FUNCTION public.gamification_executive_overview(_tenant_id uuid)
RETURNS TABLE(total_points bigint, total_events bigint, total_sales bigint, total_revenue numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    coalesce((SELECT sum(points) FROM public.gamification_events WHERE tenant_id = _tenant_id),0)::bigint,
    coalesce((SELECT count(*) FROM public.gamification_events WHERE tenant_id = _tenant_id),0)::bigint,
    coalesce((SELECT count(*) FROM public.gamification_events WHERE tenant_id = _tenant_id AND event_type = 'sale_closed'),0)::bigint,
    coalesce((SELECT sum(coalesce((metadata->>'amount')::numeric,0)) FROM public.gamification_events WHERE tenant_id = _tenant_id AND event_type = 'sale_closed'),0)::numeric
$$;

-- ---------- 15. Triggers updated_at ----------

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'tenant_credentials','tenant_members','leads','conversations','templates',
    'whatsapp_instances','whatsapp_sellers','appointments','meeting_recordings','recording_views',
    'ai_config','gamification_config','gamification_goals','gamification_streaks',
    'sheet_sync_config','automations','campaigns','billing_settings','products',
    'business_hours','google_integration'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_updated_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t);
  END LOOP;
END $$;
