CREATE OR REPLACE FUNCTION public.is_support_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_app_role(_user_id, 'support')
      OR public.has_app_role(_user_id, 'superadmin')
      OR EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.user_id = _user_id AND m.role IN ('support','owner'));
$$;

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  requester_name text,
  requester_email text,
  subject text NOT NULL,
  description text NOT NULL,
  images text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'novo',
  priority text NOT NULL DEFAULT 'normal',
  resolution_notes text,
  assigned_to uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own tickets select" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_support_staff(auth.uid()));

CREATE POLICY "own tickets insert" ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "support updates tickets" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (public.is_support_staff(auth.uid()))
  WITH CHECK (public.is_support_staff(auth.uid()));

CREATE TRIGGER trg_support_tickets_touch BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_support_tickets_status ON public.support_tickets (status, created_at DESC);
CREATE INDEX idx_support_tickets_creator ON public.support_tickets (created_by, created_at DESC);

CREATE TABLE public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid(),
  author_name text,
  is_support boolean NOT NULL DEFAULT false,
  body text NOT NULL,
  images text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.support_ticket_messages TO authenticated;
GRANT ALL ON public.support_ticket_messages TO service_role;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket messages select" ON public.support_ticket_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = support_ticket_messages.ticket_id
      AND (t.created_by = auth.uid() OR public.is_support_staff(auth.uid()))
  ));

CREATE POLICY "ticket messages insert" ON public.support_ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = support_ticket_messages.ticket_id
      AND (t.created_by = auth.uid() OR public.is_support_staff(auth.uid()))
  ));

CREATE INDEX idx_support_ticket_messages_ticket ON public.support_ticket_messages (ticket_id, created_at);

CREATE OR REPLACE FUNCTION public.ensure_tenant_role_invites()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid;
  r tenant_role;
BEGIN
  v_tenant := public.current_tenant_id();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sem tenant'; END IF;
  IF get_tenant_role(auth.uid(), v_tenant) NOT IN ('owner','supervisor') AND NOT has_app_role(auth.uid(),'superadmin') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  FOREACH r IN ARRAY ARRAY['owner','supervisor','consultant','attendant','support']::tenant_role[] LOOP
    INSERT INTO public.tenant_role_invites (tenant_id, role, created_by)
    VALUES (v_tenant, r, auth.uid())
    ON CONFLICT (tenant_id, role) DO NOTHING;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.sync_support_app_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role = 'support' THEN
    INSERT INTO public.user_roles (user_id, role, tenant_id)
    VALUES (NEW.user_id, 'support', NEW.tenant_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_sync_support_app_role
AFTER INSERT OR UPDATE OF role ON public.tenant_memberships
FOR EACH ROW EXECUTE FUNCTION public.sync_support_app_role();

CREATE POLICY "support tickets images read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'support-tickets' AND (owner = auth.uid() OR public.is_support_staff(auth.uid())));

CREATE POLICY "support tickets images upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'support-tickets' AND owner = auth.uid());