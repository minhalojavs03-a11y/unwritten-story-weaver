
-- Split owner/supervisor conversations policy: supervisor cannot see conversations
-- assigned to owner or superadmin users.

DROP POLICY IF EXISTS conversations_owner_sup ON public.conversations;
DROP POLICY IF EXISTS messages_owner_sup ON public.messages;
DROP POLICY IF EXISTS appointments_owner_sup ON public.appointments;
DROP POLICY IF EXISTS coaching_insights_owner_sup ON public.coaching_insights;

-- Helper: is user owner or superadmin of the tenant?
CREATE OR REPLACE FUNCTION public.is_owner_or_superadmin(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_app_role(_user_id, 'superadmin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships
      WHERE user_id = _user_id AND tenant_id = _tenant_id AND role = 'owner'::tenant_role
    );
$$;

-- Owner: full access
CREATE POLICY conversations_owner ON public.conversations
  FOR ALL TO authenticated
  USING (get_tenant_role(auth.uid(), tenant_id) = 'owner'::tenant_role)
  WITH CHECK (get_tenant_role(auth.uid(), tenant_id) = 'owner'::tenant_role);

-- Supervisor: all conversations EXCEPT those assigned to owner/superadmin users
CREATE POLICY conversations_supervisor ON public.conversations
  FOR ALL TO authenticated
  USING (
    get_tenant_role(auth.uid(), tenant_id) = 'supervisor'::tenant_role
    AND (
      assigned_to IS NULL
      OR NOT public.is_owner_or_superadmin(assigned_to, tenant_id)
    )
    AND (
      lead_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = conversations.lead_id
          AND l.assigned_to IS NOT NULL
          AND public.is_owner_or_superadmin(l.assigned_to, tenant_id)
      )
    )
  )
  WITH CHECK (
    get_tenant_role(auth.uid(), tenant_id) = 'supervisor'::tenant_role
  );

CREATE POLICY messages_owner ON public.messages
  FOR ALL TO authenticated
  USING (get_tenant_role(auth.uid(), tenant_id) = 'owner'::tenant_role)
  WITH CHECK (get_tenant_role(auth.uid(), tenant_id) = 'owner'::tenant_role);

CREATE POLICY messages_supervisor ON public.messages
  FOR ALL TO authenticated
  USING (
    get_tenant_role(auth.uid(), tenant_id) = 'supervisor'::tenant_role
    AND (
      lead_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = messages.lead_id
          AND l.assigned_to IS NOT NULL
          AND public.is_owner_or_superadmin(l.assigned_to, tenant_id)
      )
    )
  )
  WITH CHECK (
    get_tenant_role(auth.uid(), tenant_id) = 'supervisor'::tenant_role
  );

-- Restore other tables (appointments, coaching_insights) with the original behavior
CREATE POLICY appointments_owner_sup ON public.appointments
  FOR ALL TO authenticated
  USING (get_tenant_role(auth.uid(), tenant_id) = ANY (ARRAY['owner'::tenant_role, 'supervisor'::tenant_role]))
  WITH CHECK (get_tenant_role(auth.uid(), tenant_id) = ANY (ARRAY['owner'::tenant_role, 'supervisor'::tenant_role]));

CREATE POLICY coaching_insights_owner_sup ON public.coaching_insights
  FOR ALL TO authenticated
  USING (get_tenant_role(auth.uid(), tenant_id) = ANY (ARRAY['owner'::tenant_role, 'supervisor'::tenant_role]))
  WITH CHECK (get_tenant_role(auth.uid(), tenant_id) = ANY (ARRAY['owner'::tenant_role, 'supervisor'::tenant_role]));
