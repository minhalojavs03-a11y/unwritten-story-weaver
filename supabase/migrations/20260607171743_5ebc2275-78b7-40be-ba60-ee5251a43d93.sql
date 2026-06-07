DROP POLICY IF EXISTS messages_consultant_select ON public.messages;
DROP POLICY IF EXISTS messages_consultant_insert ON public.messages;

CREATE POLICY messages_consultant_select
ON public.messages
FOR SELECT
TO authenticated
USING (
  is_tenant_member(auth.uid(), tenant_id)
  AND get_tenant_role(auth.uid(), tenant_id) = ANY (ARRAY['consultant'::tenant_role, 'attendant'::tenant_role])
  AND lead_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id = messages.lead_id
      AND (
        l.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.tenant_members tm
          WHERE tm.id = l.assigned_member_id
            AND tm.user_id = auth.uid()
            AND tm.tenant_id = l.tenant_id
            AND tm.is_active = true
        )
      )
  )
);

CREATE POLICY messages_consultant_insert
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  is_tenant_member(auth.uid(), tenant_id)
  AND get_tenant_role(auth.uid(), tenant_id) = ANY (ARRAY['consultant'::tenant_role, 'attendant'::tenant_role])
  AND lead_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id = messages.lead_id
      AND (
        l.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.tenant_members tm
          WHERE tm.id = l.assigned_member_id
            AND tm.user_id = auth.uid()
            AND tm.tenant_id = l.tenant_id
            AND tm.is_active = true
        )
      )
  )
);

DROP POLICY IF EXISTS coaching_insights_consultant_select ON public.coaching_insights;

CREATE POLICY coaching_insights_consultant_select
ON public.coaching_insights
FOR SELECT
TO authenticated
USING (
  is_tenant_member(auth.uid(), tenant_id)
  AND get_tenant_role(auth.uid(), tenant_id) = ANY (ARRAY['consultant'::tenant_role, 'attendant'::tenant_role])
  AND (
    (
      member_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.tenant_members tm
        WHERE tm.id = coaching_insights.member_id
          AND tm.user_id = auth.uid()
          AND tm.tenant_id = coaching_insights.tenant_id
          AND tm.is_active = true
      )
    )
    OR (
      lead_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = coaching_insights.lead_id
          AND (
            l.assigned_to = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.tenant_members tm
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