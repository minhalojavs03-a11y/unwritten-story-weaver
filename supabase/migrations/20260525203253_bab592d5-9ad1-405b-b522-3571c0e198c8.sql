
-- 1) gamification_config
CREATE TABLE IF NOT EXISTS public.gamification_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE,
  points_lead_assumed int NOT NULL DEFAULT 5,
  points_contact_made int NOT NULL DEFAULT 2,
  points_meeting_scheduled int NOT NULL DEFAULT 20,
  points_sale_closed int NOT NULL DEFAULT 100,
  points_fast_response_bonus int NOT NULL DEFAULT 5,
  points_lead_lost int NOT NULL DEFAULT -10,
  fast_response_threshold_seconds int NOT NULL DEFAULT 300,
  commission_per_sale numeric NOT NULL DEFAULT 0,
  levels jsonb NOT NULL DEFAULT '[
    {"key":"bronze","label":"Bronze","min_points":0,"color":"#B45309"},
    {"key":"prata","label":"Prata","min_points":500,"color":"#94A3B8"},
    {"key":"ouro","label":"Ouro","min_points":1500,"color":"#D4A017"},
    {"key":"diamante","label":"Diamante","min_points":4000,"color":"#22D3EE"}
  ]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gamification_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff view gamification_config" ON public.gamification_config;
DROP POLICY IF EXISTS "Owners manage gamification_config" ON public.gamification_config;
DROP POLICY IF EXISTS "Superadmins manage all gamification_config" ON public.gamification_config;
CREATE POLICY "Staff view gamification_config" ON public.gamification_config
  FOR SELECT TO authenticated USING (public.is_tenant_staff(tenant_id));
CREATE POLICY "Owners manage gamification_config" ON public.gamification_config
  FOR ALL TO authenticated USING (public.is_tenant_owner(tenant_id)) WITH CHECK (public.is_tenant_owner(tenant_id));
CREATE POLICY "Superadmins manage all gamification_config" ON public.gamification_config
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
DROP TRIGGER IF EXISTS trg_gamification_config_updated ON public.gamification_config;
CREATE TRIGGER trg_gamification_config_updated
  BEFORE UPDATE ON public.gamification_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) gamification_events
CREATE TABLE IF NOT EXISTS public.gamification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  member_id uuid NOT NULL,
  event_type text NOT NULL,
  points int NOT NULL DEFAULT 0,
  lead_id uuid,
  appointment_id uuid,
  message_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gam_events_tenant_member_time ON public.gamification_events (tenant_id, member_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_gam_events_tenant_type_time ON public.gamification_events (tenant_id, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_gam_events_lead ON public.gamification_events (lead_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_gam_events_lead_event_member
  ON public.gamification_events (tenant_id, member_id, event_type, lead_id)
  WHERE lead_id IS NOT NULL AND event_type IN ('lead_assumed','sale_closed','lead_lost','meeting_scheduled');
ALTER TABLE public.gamification_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff view gamification_events" ON public.gamification_events;
DROP POLICY IF EXISTS "Staff insert gamification_events" ON public.gamification_events;
DROP POLICY IF EXISTS "Owners delete gamification_events" ON public.gamification_events;
DROP POLICY IF EXISTS "Superadmins manage all gamification_events" ON public.gamification_events;
CREATE POLICY "Staff view gamification_events" ON public.gamification_events
  FOR SELECT TO authenticated USING (public.is_tenant_staff(tenant_id));
CREATE POLICY "Staff insert gamification_events" ON public.gamification_events
  FOR INSERT TO authenticated WITH CHECK (public.is_tenant_staff(tenant_id));
CREATE POLICY "Owners delete gamification_events" ON public.gamification_events
  FOR DELETE TO authenticated USING (public.is_tenant_owner(tenant_id));
CREATE POLICY "Superadmins manage all gamification_events" ON public.gamification_events
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

-- 3) gamification_goals
CREATE TABLE IF NOT EXISTS public.gamification_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  member_id uuid,
  period text NOT NULL CHECK (period IN ('daily','weekly','monthly')),
  metric text NOT NULL CHECK (metric IN ('sales','meetings','points','contacts')),
  target_value numeric NOT NULL DEFAULT 0,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gam_goals_tenant_member ON public.gamification_goals (tenant_id, member_id);
ALTER TABLE public.gamification_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff view gamification_goals" ON public.gamification_goals;
DROP POLICY IF EXISTS "Owners manage gamification_goals" ON public.gamification_goals;
DROP POLICY IF EXISTS "Superadmins manage all gamification_goals" ON public.gamification_goals;
CREATE POLICY "Staff view gamification_goals" ON public.gamification_goals
  FOR SELECT TO authenticated USING (public.is_tenant_staff(tenant_id));
CREATE POLICY "Owners manage gamification_goals" ON public.gamification_goals
  FOR ALL TO authenticated USING (public.is_tenant_owner(tenant_id)) WITH CHECK (public.is_tenant_owner(tenant_id));
CREATE POLICY "Superadmins manage all gamification_goals" ON public.gamification_goals
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
DROP TRIGGER IF EXISTS trg_gamification_goals_updated ON public.gamification_goals;
CREATE TRIGGER trg_gamification_goals_updated
  BEFORE UPDATE ON public.gamification_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) gamification_goal_history
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
CREATE INDEX IF NOT EXISTS idx_gam_goal_hist_tenant_member ON public.gamification_goal_history (tenant_id, member_id, period_end DESC);
ALTER TABLE public.gamification_goal_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff view goal_history" ON public.gamification_goal_history;
DROP POLICY IF EXISTS "Superadmins manage goal_history" ON public.gamification_goal_history;
CREATE POLICY "Staff view goal_history" ON public.gamification_goal_history
  FOR SELECT TO authenticated USING (public.is_tenant_staff(tenant_id));
CREATE POLICY "Superadmins manage goal_history" ON public.gamification_goal_history
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

-- 5) gamification_streaks
CREATE TABLE IF NOT EXISTS public.gamification_streaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  member_id uuid NOT NULL UNIQUE,
  current_streak int NOT NULL DEFAULT 0,
  best_streak int NOT NULL DEFAULT 0,
  last_active_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gamification_streaks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff view streaks" ON public.gamification_streaks;
DROP POLICY IF EXISTS "Owners manage streaks" ON public.gamification_streaks;
DROP POLICY IF EXISTS "Superadmins manage all streaks" ON public.gamification_streaks;
CREATE POLICY "Staff view streaks" ON public.gamification_streaks
  FOR SELECT TO authenticated USING (public.is_tenant_staff(tenant_id));
CREATE POLICY "Owners manage streaks" ON public.gamification_streaks
  FOR ALL TO authenticated USING (public.is_tenant_owner(tenant_id)) WITH CHECK (public.is_tenant_owner(tenant_id));
CREATE POLICY "Superadmins manage all streaks" ON public.gamification_streaks
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

-- Helpers
CREATE OR REPLACE FUNCTION public.gamification_get_config(_tenant_id uuid)
RETURNS public.gamification_config
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _cfg public.gamification_config;
BEGIN
  SELECT * INTO _cfg FROM public.gamification_config WHERE tenant_id = _tenant_id;
  IF _cfg.id IS NULL THEN
    INSERT INTO public.gamification_config (tenant_id) VALUES (_tenant_id) ON CONFLICT (tenant_id) DO NOTHING;
    SELECT * INTO _cfg FROM public.gamification_config WHERE tenant_id = _tenant_id;
  END IF;
  RETURN _cfg;
END $$;

CREATE OR REPLACE FUNCTION public.gamification_log_event(
  _tenant_id uuid, _member_id uuid, _event_type text, _points int,
  _lead_id uuid DEFAULT NULL, _appointment_id uuid DEFAULT NULL,
  _message_id uuid DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _tenant_id IS NULL OR _member_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.gamification_events
    (tenant_id, member_id, event_type, points, lead_id, appointment_id, message_id, metadata)
  VALUES (_tenant_id, _member_id, _event_type, _points, _lead_id, _appointment_id, _message_id, _metadata)
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN RETURN;
END $$;

-- Triggers em leads / appointments / messages
CREATE OR REPLACE FUNCTION public.gamification_on_lead_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cfg public.gamification_config;
BEGIN
  BEGIN
    _cfg := public.gamification_get_config(NEW.tenant_id);
    IF NEW.assigned_member_id IS NOT NULL
       AND NEW.assigned_member_id IS DISTINCT FROM COALESCE(OLD.assigned_member_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      PERFORM public.gamification_log_event(NEW.tenant_id, NEW.assigned_member_id, 'lead_assumed',
        _cfg.points_lead_assumed, NEW.id, NULL, NULL, jsonb_build_object('credit_value', NEW.credit_value));
    END IF;
    IF NEW.stage = 'comprou' AND OLD.stage IS DISTINCT FROM 'comprou' AND NEW.assigned_member_id IS NOT NULL THEN
      PERFORM public.gamification_log_event(NEW.tenant_id, NEW.assigned_member_id, 'sale_closed',
        _cfg.points_sale_closed, NEW.id, NULL, NULL, jsonb_build_object('credit_value', NEW.credit_value));
    END IF;
    IF NEW.stage = 'perdido' AND OLD.stage IS DISTINCT FROM 'perdido' AND NEW.assigned_member_id IS NOT NULL THEN
      PERFORM public.gamification_log_event(NEW.tenant_id, NEW.assigned_member_id, 'lead_lost',
        _cfg.points_lead_lost, NEW.id);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_gamification_on_lead ON public.leads;
CREATE TRIGGER trg_gamification_on_lead AFTER UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.gamification_on_lead_change();

CREATE OR REPLACE FUNCTION public.gamification_on_appointment_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cfg public.gamification_config; _member uuid;
BEGIN
  BEGIN
    _cfg := public.gamification_get_config(NEW.tenant_id);
    _member := NEW.consultant_member_id;
    IF _member IS NULL AND NEW.lead_id IS NOT NULL THEN
      SELECT assigned_member_id INTO _member FROM public.leads WHERE id = NEW.lead_id;
    END IF;
    IF _member IS NOT NULL THEN
      PERFORM public.gamification_log_event(NEW.tenant_id, _member, 'meeting_scheduled',
        _cfg.points_meeting_scheduled, NEW.lead_id, NEW.id);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_gamification_on_appointment ON public.appointments;
CREATE TRIGGER trg_gamification_on_appointment AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.gamification_on_appointment_insert();

CREATE OR REPLACE FUNCTION public.gamification_on_message_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cfg public.gamification_config; _member uuid; _last_inbound_at timestamptz; _delta_seconds int;
BEGIN
  BEGIN
    IF NEW.direction <> 'outbound' THEN RETURN NEW; END IF;
    _cfg := public.gamification_get_config(NEW.tenant_id);
    IF NEW.lead_id IS NOT NULL THEN
      SELECT assigned_member_id INTO _member FROM public.leads WHERE id = NEW.lead_id;
    END IF;
    IF _member IS NULL THEN RETURN NEW; END IF;
    INSERT INTO public.gamification_events (tenant_id, member_id, event_type, points, lead_id, message_id)
    VALUES (NEW.tenant_id, _member, 'contact_made', _cfg.points_contact_made, NEW.lead_id, NEW.id);
    SELECT MAX(created_at) INTO _last_inbound_at FROM public.messages
      WHERE conversation_id = NEW.conversation_id AND direction = 'inbound' AND created_at < NEW.created_at;
    IF _last_inbound_at IS NOT NULL THEN
      _delta_seconds := EXTRACT(EPOCH FROM (NEW.created_at - _last_inbound_at))::int;
      IF _delta_seconds <= _cfg.fast_response_threshold_seconds THEN
        INSERT INTO public.gamification_events (tenant_id, member_id, event_type, points, lead_id, message_id, metadata)
        VALUES (NEW.tenant_id, _member, 'fast_response_bonus', _cfg.points_fast_response_bonus,
                NEW.lead_id, NEW.id, jsonb_build_object('delta_seconds', _delta_seconds));
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_gamification_on_message ON public.messages;
CREATE TRIGGER trg_gamification_on_message AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.gamification_on_message_insert();

-- Janela do período
CREATE OR REPLACE FUNCTION public.gamification_period_start(_period text)
RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _period
    WHEN 'daily'   THEN date_trunc('day',   now())
    WHEN 'weekly'  THEN date_trunc('week',  now())
    WHEN 'monthly' THEN date_trunc('month', now())
    ELSE 'epoch'::timestamptz
  END
$$;

-- Ranking
CREATE OR REPLACE FUNCTION public.gamification_ranking(_period text DEFAULT 'monthly')
RETURNS TABLE (
  member_id uuid, display_name text, avatar_color text, avatar_url text, role_label text,
  points bigint, sales bigint, meetings bigint, contacts bigint, leads_assumed bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _tid uuid := private.current_tenant_id(); _s timestamptz := public.gamification_period_start(_period);
BEGIN
  RETURN QUERY
  WITH _agg AS (
    SELECT e.member_id AS mid,
           SUM(e.points)::bigint AS pts,
           COUNT(*) FILTER (WHERE e.event_type='sale_closed')::bigint AS sls,
           COUNT(*) FILTER (WHERE e.event_type='meeting_scheduled')::bigint AS mts,
           COUNT(*) FILTER (WHERE e.event_type='contact_made')::bigint AS cts,
           COUNT(*) FILTER (WHERE e.event_type='lead_assumed')::bigint AS las
    FROM public.gamification_events e
    WHERE e.tenant_id = _tid AND e.occurred_at >= _s
    GROUP BY e.member_id
  )
  SELECT m.id, m.display_name, m.avatar_color, m.avatar_url, m.role_label,
         COALESCE(a.pts,0), COALESCE(a.sls,0), COALESCE(a.mts,0),
         COALESCE(a.cts,0), COALESCE(a.las,0)
  FROM public.tenant_members m
  LEFT JOIN _agg a ON a.mid = m.id
  WHERE m.tenant_id = _tid AND m.is_active = true
  ORDER BY COALESCE(a.pts,0) DESC, m.display_name ASC;
END $$;

-- Resumo do consultor
CREATE OR REPLACE FUNCTION public.gamification_member_summary(_member_id uuid, _period text DEFAULT 'monthly')
RETURNS TABLE (
  points bigint, sales bigint, meetings bigint, contacts bigint,
  leads_assumed bigint, fast_responses bigint, rank_position int, total_members int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _tid uuid := private.current_tenant_id(); _s timestamptz := public.gamification_period_start(_period);
BEGIN
  RETURN QUERY
  WITH _r AS (
    SELECT r.member_id AS mid, r.points AS pts,
           ROW_NUMBER() OVER (ORDER BY r.points DESC)::int AS pos,
           COUNT(*) OVER ()::int AS total
    FROM public.gamification_ranking(_period) r
  ),
  _me AS (
    SELECT
      COALESCE(SUM(e.points),0)::bigint AS pts,
      COUNT(*) FILTER (WHERE e.event_type='sale_closed')::bigint AS sls,
      COUNT(*) FILTER (WHERE e.event_type='meeting_scheduled')::bigint AS mts,
      COUNT(*) FILTER (WHERE e.event_type='contact_made')::bigint AS cts,
      COUNT(*) FILTER (WHERE e.event_type='lead_assumed')::bigint AS las,
      COUNT(*) FILTER (WHERE e.event_type='fast_response_bonus')::bigint AS frs
    FROM public.gamification_events e
    WHERE e.tenant_id = _tid AND e.member_id = _member_id AND e.occurred_at >= _s
  )
  SELECT _me.pts, _me.sls, _me.mts, _me.cts, _me.las, _me.frs,
         COALESCE((SELECT pos FROM _r WHERE mid = _member_id), 0),
         COALESCE((SELECT MAX(total) FROM _r), 0)
  FROM _me;
END $$;

-- Visão de equipe
CREATE OR REPLACE FUNCTION public.gamification_team_overview(_period text DEFAULT 'weekly')
RETURNS TABLE (
  member_id uuid, display_name text, avatar_color text, role_label text,
  last_seen_at timestamptz, points bigint, sales bigint, meetings bigint,
  contacts bigint, leads_assumed bigint, active_leads bigint, stalled_leads bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _tid uuid := private.current_tenant_id();
BEGIN
  RETURN QUERY
  WITH _r AS (SELECT * FROM public.gamification_ranking(_period))
  SELECT m.id, m.display_name, m.avatar_color, m.role_label, m.last_seen_at,
         COALESCE(r.points,0), COALESCE(r.sales,0), COALESCE(r.meetings,0),
         COALESCE(r.contacts,0), COALESCE(r.leads_assumed,0),
         (SELECT COUNT(*) FROM public.leads l
            WHERE l.tenant_id = _tid AND l.assigned_member_id = m.id
              AND l.stage NOT IN ('comprou','perdido'))::bigint,
         (SELECT COUNT(*) FROM public.leads l
            WHERE l.tenant_id = _tid AND l.assigned_member_id = m.id
              AND l.stage NOT IN ('comprou','perdido')
              AND COALESCE(l.last_interaction_at, l.updated_at) < now() - interval '48 hours')::bigint
  FROM public.tenant_members m
  LEFT JOIN _r r ON r.member_id = m.id
  WHERE m.tenant_id = _tid AND m.is_active = true
  ORDER BY COALESCE(r.points,0) DESC;
END $$;

-- Visão executiva
CREATE OR REPLACE FUNCTION public.gamification_executive_overview(_period text DEFAULT 'monthly')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tid uuid := private.current_tenant_id();
  _s timestamptz := public.gamification_period_start(_period);
  _cfg public.gamification_config;
  _result jsonb;
BEGIN
  _cfg := public.gamification_get_config(_tid);
  WITH base AS (
    SELECT e.event_type AS et, SUM(e.points)::bigint AS pts, COUNT(*)::bigint AS qty
    FROM public.gamification_events e
    WHERE e.tenant_id = _tid AND e.occurred_at >= _s
    GROUP BY e.event_type
  ),
  totals AS (
    SELECT
      COALESCE((SELECT qty FROM base WHERE et='sale_closed'),0) AS sales,
      COALESCE((SELECT qty FROM base WHERE et='meeting_scheduled'),0) AS meetings,
      COALESCE((SELECT qty FROM base WHERE et='contact_made'),0) AS contacts,
      COALESCE((SELECT qty FROM base WHERE et='lead_assumed'),0) AS leads_assumed,
      COALESCE((SELECT SUM(pts) FROM base),0) AS points,
      (SELECT COUNT(*) FROM public.leads l WHERE l.tenant_id = _tid AND l.created_at >= _s) AS leads_total
  ),
  daily AS (
    SELECT to_char(date_trunc('day', e.occurred_at), 'YYYY-MM-DD') AS day,
           COUNT(*) FILTER (WHERE e.event_type='sale_closed') AS sales,
           COUNT(*) FILTER (WHERE e.event_type='meeting_scheduled') AS meetings,
           SUM(e.points) AS points
    FROM public.gamification_events e
    WHERE e.tenant_id = _tid AND e.occurred_at >= _s
    GROUP BY 1 ORDER BY 1
  )
  SELECT jsonb_build_object(
    'totals', (SELECT to_jsonb(totals) FROM totals),
    'estimated_revenue', (SELECT (sales * _cfg.commission_per_sale) FROM totals),
    'conversion_rate', (SELECT CASE WHEN leads_total > 0 THEN (sales::numeric / leads_total) ELSE 0 END FROM totals),
    'timeseries', COALESCE((SELECT jsonb_agg(to_jsonb(daily)) FROM daily), '[]'::jsonb),
    'funnel', jsonb_build_object(
      'novo',        (SELECT COUNT(*) FROM public.leads l WHERE l.tenant_id=_tid AND l.created_at>=_s),
      'qualificado', (SELECT COUNT(*) FROM public.leads l WHERE l.tenant_id=_tid AND l.created_at>=_s AND l.stage IN ('qualificado','agendado','compareceu','comprou')),
      'agendado',    (SELECT COUNT(*) FROM public.leads l WHERE l.tenant_id=_tid AND l.created_at>=_s AND l.stage IN ('agendado','compareceu','comprou')),
      'compareceu',  (SELECT COUNT(*) FROM public.leads l WHERE l.tenant_id=_tid AND l.created_at>=_s AND l.stage IN ('compareceu','comprou')),
      'comprou',     (SELECT COUNT(*) FROM public.leads l WHERE l.tenant_id=_tid AND l.created_at>=_s AND l.stage='comprou')
    )
  ) INTO _result;
  RETURN _result;
END $$;

-- Seed em tenants existentes
INSERT INTO public.gamification_config (tenant_id)
SELECT id FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;

-- Auto-criar config para novos tenants
CREATE OR REPLACE FUNCTION public.create_default_gamification_config()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.gamification_config (tenant_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_create_default_gamification_config ON public.tenants;
CREATE TRIGGER trg_create_default_gamification_config
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.create_default_gamification_config();
