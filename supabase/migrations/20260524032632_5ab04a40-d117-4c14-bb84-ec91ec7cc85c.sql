
CREATE TABLE public.lead_transfer_requests (
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

ALTER TABLE public.lead_transfer_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view transfer requests"
  ON public.lead_transfer_requests FOR SELECT TO authenticated
  USING (is_tenant_staff(tenant_id));

CREATE POLICY "Staff create transfer requests"
  ON public.lead_transfer_requests FOR INSERT TO authenticated
  WITH CHECK (is_tenant_staff(tenant_id));

CREATE POLICY "Staff update transfer requests"
  ON public.lead_transfer_requests FOR UPDATE TO authenticated
  USING (is_tenant_staff(tenant_id))
  WITH CHECK (is_tenant_staff(tenant_id));

CREATE POLICY "Superadmins manage transfer requests"
  ON public.lead_transfer_requests FOR ALL TO authenticated
  USING (is_superadmin(auth.uid()))
  WITH CHECK (is_superadmin(auth.uid()));

CREATE UNIQUE INDEX lead_transfer_requests_unique_pending
  ON public.lead_transfer_requests (lead_id, requester_member_id)
  WHERE status = 'pending';

CREATE INDEX lead_transfer_requests_owner_idx
  ON public.lead_transfer_requests (owner_member_id, status);

ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_transfer_requests;
