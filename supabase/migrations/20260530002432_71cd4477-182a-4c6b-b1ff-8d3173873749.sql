
-- CONVERSATIONS
DROP POLICY IF EXISTS conversations_all ON public.conversations;

CREATE POLICY conversations_superadmin_all
ON public.conversations
FOR ALL
TO authenticated
USING (public.has_app_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (public.has_app_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY conversations_tenant_with_lead
ON public.conversations
FOR ALL
TO authenticated
USING (
  public.is_tenant_member(auth.uid(), tenant_id)
  AND lead_id IS NOT NULL
)
WITH CHECK (
  public.is_tenant_member(auth.uid(), tenant_id)
);

-- MESSAGES
DROP POLICY IF EXISTS messages_all ON public.messages;

CREATE POLICY messages_superadmin_all
ON public.messages
FOR ALL
TO authenticated
USING (public.has_app_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (public.has_app_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY messages_tenant_with_lead
ON public.messages
FOR ALL
TO authenticated
USING (
  public.is_tenant_member(auth.uid(), tenant_id)
  AND lead_id IS NOT NULL
)
WITH CHECK (
  public.is_tenant_member(auth.uid(), tenant_id)
);
