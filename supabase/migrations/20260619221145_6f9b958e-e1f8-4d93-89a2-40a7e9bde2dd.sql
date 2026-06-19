-- ============================================================
-- 1) Tabela de solicitações de takeover de lead (supervisor → consultor)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lead_takeover_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  requester_user_id uuid NOT NULL,
  requester_member_id uuid REFERENCES public.tenant_members(id) ON DELETE SET NULL,
  owner_user_id uuid,
  owner_member_id uuid REFERENCES public.tenant_members(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','expired','cancelled')),
  message text,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ltr_lead ON public.lead_takeover_requests(lead_id);
CREATE INDEX IF NOT EXISTS idx_ltr_requester ON public.lead_takeover_requests(requester_user_id);
CREATE INDEX IF NOT EXISTS idx_ltr_owner ON public.lead_takeover_requests(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_ltr_status ON public.lead_takeover_requests(status);

GRANT SELECT, INSERT, UPDATE ON public.lead_takeover_requests TO authenticated;
GRANT ALL ON public.lead_takeover_requests TO service_role;

ALTER TABLE public.lead_takeover_requests ENABLE ROW LEVEL SECURITY;

-- Visualização: superadmin, owner do tenant, solicitante e dono do lead
CREATE POLICY "ltr_select" ON public.lead_takeover_requests
FOR SELECT TO authenticated
USING (
  public.has_app_role(auth.uid(), 'superadmin'::public.app_role)
  OR public.get_tenant_role(auth.uid(), tenant_id) = 'owner'::public.tenant_role
  OR requester_user_id = auth.uid()
  OR owner_user_id = auth.uid()
);

-- Inserção: apenas o próprio supervisor solicitante (ou superadmin)
CREATE POLICY "ltr_insert" ON public.lead_takeover_requests
FOR INSERT TO authenticated
WITH CHECK (
  requester_user_id = auth.uid()
  AND (
    public.has_app_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.get_tenant_role(auth.uid(), tenant_id) IN ('supervisor'::public.tenant_role, 'owner'::public.tenant_role)
  )
);

-- Update: dono do lead aprova/recusa; supervisor pode cancelar; superadmin tudo
CREATE POLICY "ltr_update" ON public.lead_takeover_requests
FOR UPDATE TO authenticated
USING (
  public.has_app_role(auth.uid(), 'superadmin'::public.app_role)
  OR owner_user_id = auth.uid()
  OR requester_user_id = auth.uid()
  OR public.get_tenant_role(auth.uid(), tenant_id) = 'owner'::public.tenant_role
);

-- Trigger updated_at
CREATE TRIGGER trg_ltr_touch
BEFORE UPDATE ON public.lead_takeover_requests
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 2) RPC: criar solicitação (supervisor)
-- ============================================================
CREATE OR REPLACE FUNCTION public.request_lead_takeover(_lead_id uuid, _message text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_owner_user uuid;
  v_owner_member uuid;
  v_lead_stage text;
  v_lead_status text;
  v_req_member uuid;
  v_id uuid;
  v_requester_name text;
  v_lead_name text;
  v_is_lost boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT l.tenant_id, l.assigned_to, l.assigned_member_id, l.stage, l.status, l.name
    INTO v_tenant, v_owner_user, v_owner_member, v_lead_stage, v_lead_status, v_lead_name
  FROM public.leads l WHERE l.id = _lead_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'lead not found'; END IF;

  v_is_lost := lower(coalesce(v_lead_stage,'')) IN ('perdido','lost')
            OR lower(coalesce(v_lead_status,'')) IN ('perdido','lost');
  IF NOT v_is_lost THEN
    RAISE EXCEPTION 'Solicitação só pode ser feita quando o lead estiver marcado como perdido';
  END IF;

  IF v_owner_user IS NULL THEN
    RAISE EXCEPTION 'Lead sem consultor responsável';
  END IF;

  IF v_owner_user = auth.uid() THEN
    RAISE EXCEPTION 'Lead já é seu';
  END IF;

  -- Reaproveita solicitação pendente existente
  SELECT id INTO v_id FROM public.lead_takeover_requests
   WHERE lead_id = _lead_id AND requester_user_id = auth.uid() AND status = 'pending'
   LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT tm.id INTO v_req_member
  FROM public.tenant_members tm
  WHERE tm.tenant_id = v_tenant AND tm.user_id = auth.uid() AND tm.is_active = true
  ORDER BY tm.created_at ASC LIMIT 1;

  INSERT INTO public.lead_takeover_requests(
    tenant_id, lead_id, requester_user_id, requester_member_id,
    owner_user_id, owner_member_id, message, status
  ) VALUES (
    v_tenant, _lead_id, auth.uid(), v_req_member,
    v_owner_user, v_owner_member, _message, 'pending'
  ) RETURNING id INTO v_id;

  SELECT COALESCE(NULLIF(display_name,''), NULLIF(full_name,''), NULLIF(email,''), 'Supervisor')
    INTO v_requester_name FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.app_notifications(tenant_id, recipient_user_id, type, title, body, lead_id)
  VALUES (
    v_tenant, v_owner_user, 'lead_takeover_request',
    'Pedido de atendimento',
    coalesce(v_requester_name,'Supervisor') || ' quer assumir o lead ' || coalesce(v_lead_name,'') || '. Aprove ou recuse.',
    _lead_id
  );

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.request_lead_takeover(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.request_lead_takeover(uuid, text) TO authenticated;

-- ============================================================
-- 3) RPC: aprovar (consultor dono ou superadmin)
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_lead_takeover(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.lead_takeover_requests%ROWTYPE;
  v_owner_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO r FROM public.lead_takeover_requests WHERE id = _request_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'request not found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'request not pending'; END IF;

  IF NOT (
    public.has_app_role(auth.uid(),'superadmin'::public.app_role)
    OR r.owner_user_id = auth.uid()
    OR public.get_tenant_role(auth.uid(), r.tenant_id) = 'owner'::public.tenant_role
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  UPDATE public.leads
     SET assigned_to = r.requester_user_id,
         assigned_member_id = r.requester_member_id,
         assigned_member_at = now(),
         updated_at = now()
   WHERE id = r.lead_id;

  UPDATE public.lead_takeover_requests
     SET status = 'approved', responded_at = now()
   WHERE id = r.id;

  SELECT COALESCE(NULLIF(display_name,''), NULLIF(full_name,''), 'Consultor')
    INTO v_owner_name FROM public.profiles WHERE id = r.owner_user_id;

  INSERT INTO public.app_notifications(tenant_id, recipient_user_id, type, title, body, lead_id)
  VALUES (
    r.tenant_id, r.requester_user_id, 'lead_takeover_approved',
    'Atendimento liberado',
    coalesce(v_owner_name,'Consultor') || ' aprovou seu pedido. Você agora atende esse lead.',
    r.lead_id
  );
END $$;

REVOKE ALL ON FUNCTION public.approve_lead_takeover(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.approve_lead_takeover(uuid) TO authenticated;

-- ============================================================
-- 4) RPC: recusar
-- ============================================================
CREATE OR REPLACE FUNCTION public.deny_lead_takeover(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.lead_takeover_requests%ROWTYPE;
  v_owner_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO r FROM public.lead_takeover_requests WHERE id = _request_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'request not found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'request not pending'; END IF;

  IF NOT (
    public.has_app_role(auth.uid(),'superadmin'::public.app_role)
    OR r.owner_user_id = auth.uid()
    OR public.get_tenant_role(auth.uid(), r.tenant_id) = 'owner'::public.tenant_role
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  UPDATE public.lead_takeover_requests
     SET status = 'denied', responded_at = now()
   WHERE id = r.id;

  SELECT COALESCE(NULLIF(display_name,''), NULLIF(full_name,''), 'Consultor')
    INTO v_owner_name FROM public.profiles WHERE id = r.owner_user_id;

  INSERT INTO public.app_notifications(tenant_id, recipient_user_id, type, title, body, lead_id)
  VALUES (
    r.tenant_id, r.requester_user_id, 'lead_takeover_denied',
    'Pedido recusado',
    coalesce(v_owner_name,'Consultor') || ' recusou seu pedido de atendimento.',
    r.lead_id
  );
END $$;

REVOKE ALL ON FUNCTION public.deny_lead_takeover(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.deny_lead_takeover(uuid) TO authenticated;

-- ============================================================
-- 5) Endurecer assume_lead: supervisor NÃO pode mais invadir.
--    Permitido apenas: superadmin, owner, ou o próprio user_id do member.
-- ============================================================
CREATE OR REPLACE FUNCTION public.assume_lead(_lead_id uuid, _member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid;
  _current uuid;
  _member_tenant uuid;
  _member_user uuid;
  _can_override boolean;
  _max numeric;
  _credit numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT tenant_id, assigned_member_id, credit_value
    INTO _tenant, _current, _credit
  FROM public.leads WHERE id = _lead_id;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'lead not found'; END IF;

  SELECT tenant_id, max_credit_value, user_id
    INTO _member_tenant, _max, _member_user
  FROM public.tenant_members
  WHERE id = _member_id AND is_active = true;
  IF _member_tenant IS NULL OR _member_tenant <> _tenant THEN
    RAISE EXCEPTION 'invalid member';
  END IF;

  -- Supervisor REMOVIDO do override. Apenas superadmin e owner.
  _can_override :=
    public.has_app_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.get_tenant_role(auth.uid(), _tenant) = 'owner'::public.tenant_role;

  IF NOT _can_override AND _member_user IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'member does not belong to current user';
  END IF;

  IF _current IS NOT NULL AND _current <> _member_id AND NOT _can_override THEN
    RAISE EXCEPTION 'lead already assigned to another member';
  END IF;

  IF _max IS NOT NULL AND _credit IS NOT NULL AND _credit > _max AND NOT _can_override THEN
    RAISE EXCEPTION 'lead_out_of_credit_range: teto do consultor R$ %, lead R$ %', _max, _credit;
  END IF;

  UPDATE public.leads
  SET assigned_member_id = _member_id,
      assigned_to = _member_user,
      assigned_member_at = COALESCE(assigned_member_at, now()),
      updated_at = now()
  WHERE id = _lead_id;
END $$;

CREATE OR REPLACE FUNCTION public.release_lead(_lead_id uuid, _member_id uuid DEFAULT NULL::uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid;
  _current uuid;
  _current_user uuid;
  _can_override boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT l.tenant_id, l.assigned_member_id, tm.user_id
    INTO _tenant, _current, _current_user
  FROM public.leads l
  LEFT JOIN public.tenant_members tm ON tm.id = l.assigned_member_id
  WHERE l.id = _lead_id;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'lead not found'; END IF;

  -- Supervisor REMOVIDO. Só superadmin/owner pode liberar lead alheio.
  _can_override :=
    public.has_app_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.get_tenant_role(auth.uid(), _tenant) = 'owner'::public.tenant_role;

  IF NOT _can_override AND _current_user IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF _member_id IS NOT NULL AND _current IS DISTINCT FROM _member_id AND NOT _can_override THEN
    RAISE EXCEPTION 'lead assigned to another member';
  END IF;

  UPDATE public.leads
  SET assigned_to = NULL,
      assigned_member_id = NULL,
      assigned_member_at = NULL,
      updated_at = now()
  WHERE id = _lead_id;
END $$;

-- Habilita Realtime para a nova tabela
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_takeover_requests;