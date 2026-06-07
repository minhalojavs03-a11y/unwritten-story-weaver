DROP POLICY IF EXISTS leads_consultant_select ON public.leads;
DROP POLICY IF EXISTS leads_consultant_update ON public.leads;

CREATE POLICY leads_consultant_select
ON public.leads
FOR SELECT
TO authenticated
USING (
  is_tenant_member(auth.uid(), tenant_id)
  AND get_tenant_role(auth.uid(), tenant_id) = ANY (ARRAY['consultant'::tenant_role, 'attendant'::tenant_role])
  AND (
    assigned_to = auth.uid()
    OR assigned_to IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.id = leads.assigned_member_id
        AND tm.user_id = auth.uid()
        AND tm.tenant_id = leads.tenant_id
        AND tm.is_active = true
    )
  )
);

CREATE POLICY leads_consultant_update
ON public.leads
FOR UPDATE
TO authenticated
USING (
  is_tenant_member(auth.uid(), tenant_id)
  AND get_tenant_role(auth.uid(), tenant_id) = ANY (ARRAY['consultant'::tenant_role, 'attendant'::tenant_role])
  AND (
    assigned_to = auth.uid()
    OR assigned_to IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.id = leads.assigned_member_id
        AND tm.user_id = auth.uid()
        AND tm.tenant_id = leads.tenant_id
        AND tm.is_active = true
    )
  )
)
WITH CHECK (
  is_tenant_member(auth.uid(), tenant_id)
  AND get_tenant_role(auth.uid(), tenant_id) = ANY (ARRAY['consultant'::tenant_role, 'attendant'::tenant_role])
);

DROP POLICY IF EXISTS conversations_consultant_select ON public.conversations;
DROP POLICY IF EXISTS conversations_consultant_update ON public.conversations;

CREATE POLICY conversations_consultant_select
ON public.conversations
FOR SELECT
TO authenticated
USING (
  is_tenant_member(auth.uid(), tenant_id)
  AND get_tenant_role(auth.uid(), tenant_id) = ANY (ARRAY['consultant'::tenant_role, 'attendant'::tenant_role])
  AND lead_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id = conversations.lead_id
      AND (
        l.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.tenant_members tm
          WHERE tm.id = l.assigned_member_id
            AND tm.user_id = auth.uid()
            AND tm.tenant_id = l.tenant_id
            AND tm.is_active = true
        )
      )
  )
);

CREATE POLICY conversations_consultant_update
ON public.conversations
FOR UPDATE
TO authenticated
USING (
  is_tenant_member(auth.uid(), tenant_id)
  AND get_tenant_role(auth.uid(), tenant_id) = ANY (ARRAY['consultant'::tenant_role, 'attendant'::tenant_role])
  AND lead_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id = conversations.lead_id
      AND (
        l.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.tenant_members tm
          WHERE tm.id = l.assigned_member_id
            AND tm.user_id = auth.uid()
            AND tm.tenant_id = l.tenant_id
            AND tm.is_active = true
        )
      )
  )
)
WITH CHECK (
  is_tenant_member(auth.uid(), tenant_id)
);

DROP POLICY IF EXISTS appointments_consultant_select ON public.appointments;
DROP POLICY IF EXISTS appointments_consultant_update ON public.appointments;

CREATE POLICY appointments_consultant_select
ON public.appointments
FOR SELECT
TO authenticated
USING (
  is_tenant_member(auth.uid(), tenant_id)
  AND get_tenant_role(auth.uid(), tenant_id) = ANY (ARRAY['consultant'::tenant_role, 'attendant'::tenant_role])
  AND (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.id = appointments.consultant_member_id
        AND tm.user_id = auth.uid()
        AND tm.tenant_id = appointments.tenant_id
        AND tm.is_active = true
    )
    OR (
      lead_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.leads l
        WHERE l.id = appointments.lead_id
          AND (
            l.assigned_to = auth.uid()
            OR EXISTS (
              SELECT 1
              FROM public.tenant_members tm
              WHERE tm.id = l.assigned_member_id
                AND tm.user_id = auth.uid()
                AND tm.tenant_id = l.tenant_id
                AND tm.is_active = true
            )
          )
      )
    )
  )
);

CREATE POLICY appointments_consultant_update
ON public.appointments
FOR UPDATE
TO authenticated
USING (
  is_tenant_member(auth.uid(), tenant_id)
  AND get_tenant_role(auth.uid(), tenant_id) = ANY (ARRAY['consultant'::tenant_role, 'attendant'::tenant_role])
  AND (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.id = appointments.consultant_member_id
        AND tm.user_id = auth.uid()
        AND tm.tenant_id = appointments.tenant_id
        AND tm.is_active = true
    )
    OR (
      lead_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.leads l
        WHERE l.id = appointments.lead_id
          AND (
            l.assigned_to = auth.uid()
            OR EXISTS (
              SELECT 1
              FROM public.tenant_members tm
              WHERE tm.id = l.assigned_member_id
                AND tm.user_id = auth.uid()
                AND tm.tenant_id = l.tenant_id
                AND tm.is_active = true
            )
          )
      )
    )
  )
)
WITH CHECK (
  is_tenant_member(auth.uid(), tenant_id)
);