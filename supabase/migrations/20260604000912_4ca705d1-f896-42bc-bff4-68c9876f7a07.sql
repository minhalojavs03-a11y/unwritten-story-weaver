
CREATE OR REPLACE FUNCTION public.is_ediane_phone(_phone text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _phone IS NOT NULL
     AND regexp_replace(_phone, '[^0-9]', '', 'g') LIKE '%4599874647%';
$$;

-- LEADS
DROP POLICY IF EXISTS leads_hide_ediane ON public.leads;
CREATE POLICY leads_hide_ediane ON public.leads
AS RESTRICTIVE FOR ALL TO authenticated
USING (NOT public.is_ediane_phone(phone) OR public.has_app_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (NOT public.is_ediane_phone(phone) OR public.has_app_role(auth.uid(), 'superadmin'::app_role));

-- CONVERSATIONS
DROP POLICY IF EXISTS conversations_hide_ediane ON public.conversations;
CREATE POLICY conversations_hide_ediane ON public.conversations
AS RESTRICTIVE FOR ALL TO authenticated
USING (
  public.has_app_role(auth.uid(), 'superadmin'::app_role)
  OR lead_id IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = conversations.lead_id AND public.is_ediane_phone(l.phone)
  )
)
WITH CHECK (
  public.has_app_role(auth.uid(), 'superadmin'::app_role)
  OR lead_id IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = conversations.lead_id AND public.is_ediane_phone(l.phone)
  )
);

-- MESSAGES
DROP POLICY IF EXISTS messages_hide_ediane ON public.messages;
CREATE POLICY messages_hide_ediane ON public.messages
AS RESTRICTIVE FOR ALL TO authenticated
USING (
  public.has_app_role(auth.uid(), 'superadmin'::app_role)
  OR (
    (lead_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id = messages.lead_id AND public.is_ediane_phone(l.phone)))
    AND (conversation_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.conversations c JOIN public.leads l ON l.id = c.lead_id
      WHERE c.id = messages.conversation_id AND public.is_ediane_phone(l.phone)
    ))
  )
)
WITH CHECK (
  public.has_app_role(auth.uid(), 'superadmin'::app_role)
  OR (
    (lead_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id = messages.lead_id AND public.is_ediane_phone(l.phone)))
    AND (conversation_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.conversations c JOIN public.leads l ON l.id = c.lead_id
      WHERE c.id = messages.conversation_id AND public.is_ediane_phone(l.phone)
    ))
  )
);
