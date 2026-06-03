-- =====================================================================
-- Etapa 3: RBAC ponta-a-ponta nas tabelas operacionais
-- =====================================================================

-- ---------------------- LEADS ----------------------
DROP POLICY IF EXISTS leads_all ON public.leads;

CREATE POLICY leads_superadmin ON public.leads
  FOR ALL TO authenticated
  USING (public.has_app_role(auth.uid(),'superadmin'))
  WITH CHECK (public.has_app_role(auth.uid(),'superadmin'));

CREATE POLICY leads_owner_sup ON public.leads
  FOR ALL TO authenticated
  USING (public.get_tenant_role(auth.uid(), tenant_id) IN ('owner','supervisor'))
  WITH CHECK (public.get_tenant_role(auth.uid(), tenant_id) IN ('owner','supervisor'));

-- Consultor / atendente: SELECT nos próprios + fila (sem dono)
CREATE POLICY leads_consultant_select ON public.leads
  FOR SELECT TO authenticated
  USING (
    public.is_tenant_member(auth.uid(), tenant_id)
    AND public.get_tenant_role(auth.uid(), tenant_id) IN ('consultant','attendant')
    AND (assigned_to = auth.uid() OR assigned_to IS NULL)
  );

-- Consultor / atendente: pode atualizar (assumir) leads
CREATE POLICY leads_consultant_update ON public.leads
  FOR UPDATE TO authenticated
  USING (
    public.is_tenant_member(auth.uid(), tenant_id)
    AND public.get_tenant_role(auth.uid(), tenant_id) IN ('consultant','attendant')
    AND (assigned_to = auth.uid() OR assigned_to IS NULL)
  )
  WITH CHECK (
    public.is_tenant_member(auth.uid(), tenant_id)
    AND public.get_tenant_role(auth.uid(), tenant_id) IN ('consultant','attendant')
  );

-- INSERT continua aberto a qualquer membro do tenant (edge functions usam service_role)
CREATE POLICY leads_member_insert ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- ---------------------- CONVERSATIONS ----------------------
DROP POLICY IF EXISTS conversations_superadmin_all ON public.conversations;
DROP POLICY IF EXISTS conversations_tenant_with_lead ON public.conversations;

CREATE POLICY conversations_superadmin ON public.conversations
  FOR ALL TO authenticated
  USING (public.has_app_role(auth.uid(),'superadmin'))
  WITH CHECK (public.has_app_role(auth.uid(),'superadmin'));

CREATE POLICY conversations_owner_sup ON public.conversations
  FOR ALL TO authenticated
  USING (public.get_tenant_role(auth.uid(), tenant_id) IN ('owner','supervisor'))
  WITH CHECK (public.get_tenant_role(auth.uid(), tenant_id) IN ('owner','supervisor'));

-- Consultor: vê conversas dos próprios leads
CREATE POLICY conversations_consultant_select ON public.conversations
  FOR SELECT TO authenticated
  USING (
    public.is_tenant_member(auth.uid(), tenant_id)
    AND public.get_tenant_role(auth.uid(), tenant_id) IN ('consultant','attendant')
    AND lead_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.leads l
       WHERE l.id = conversations.lead_id
         AND l.assigned_to = auth.uid()
    )
  );

CREATE POLICY conversations_consultant_modify ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_tenant_member(auth.uid(), tenant_id)
    AND public.get_tenant_role(auth.uid(), tenant_id) IN ('consultant','attendant')
  );

CREATE POLICY conversations_consultant_update ON public.conversations
  FOR UPDATE TO authenticated
  USING (
    public.is_tenant_member(auth.uid(), tenant_id)
    AND public.get_tenant_role(auth.uid(), tenant_id) IN ('consultant','attendant')
    AND lead_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.leads l
       WHERE l.id = conversations.lead_id
         AND l.assigned_to = auth.uid()
    )
  )
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- ---------------------- MESSAGES ----------------------
DROP POLICY IF EXISTS messages_superadmin_all ON public.messages;
DROP POLICY IF EXISTS messages_tenant_with_lead ON public.messages;

CREATE POLICY messages_superadmin ON public.messages
  FOR ALL TO authenticated
  USING (public.has_app_role(auth.uid(),'superadmin'))
  WITH CHECK (public.has_app_role(auth.uid(),'superadmin'));

CREATE POLICY messages_owner_sup ON public.messages
  FOR ALL TO authenticated
  USING (public.get_tenant_role(auth.uid(), tenant_id) IN ('owner','supervisor'))
  WITH CHECK (public.get_tenant_role(auth.uid(), tenant_id) IN ('owner','supervisor'));

CREATE POLICY messages_consultant_select ON public.messages
  FOR SELECT TO authenticated
  USING (
    public.is_tenant_member(auth.uid(), tenant_id)
    AND public.get_tenant_role(auth.uid(), tenant_id) IN ('consultant','attendant')
    AND lead_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.leads l
       WHERE l.id = messages.lead_id
         AND l.assigned_to = auth.uid()
    )
  );

CREATE POLICY messages_consultant_insert ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_tenant_member(auth.uid(), tenant_id)
    AND public.get_tenant_role(auth.uid(), tenant_id) IN ('consultant','attendant')
    AND lead_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.leads l
       WHERE l.id = messages.lead_id
         AND l.assigned_to = auth.uid()
    )
  );

-- ---------------------- APPOINTMENTS ----------------------
DROP POLICY IF EXISTS appointments_all ON public.appointments;

CREATE POLICY appointments_superadmin ON public.appointments
  FOR ALL TO authenticated
  USING (public.has_app_role(auth.uid(),'superadmin'))
  WITH CHECK (public.has_app_role(auth.uid(),'superadmin'));

CREATE POLICY appointments_owner_sup ON public.appointments
  FOR ALL TO authenticated
  USING (public.get_tenant_role(auth.uid(), tenant_id) IN ('owner','supervisor'))
  WITH CHECK (public.get_tenant_role(auth.uid(), tenant_id) IN ('owner','supervisor'));

CREATE POLICY appointments_consultant_select ON public.appointments
  FOR SELECT TO authenticated
  USING (
    public.is_tenant_member(auth.uid(), tenant_id)
    AND public.get_tenant_role(auth.uid(), tenant_id) IN ('consultant','attendant')
    AND (
      created_by = auth.uid()
      OR (lead_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.leads l
         WHERE l.id = appointments.lead_id AND l.assigned_to = auth.uid()
      ))
    )
  );

CREATE POLICY appointments_consultant_write ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_tenant_member(auth.uid(), tenant_id)
    AND public.get_tenant_role(auth.uid(), tenant_id) IN ('consultant','attendant')
    AND created_by = auth.uid()
  );

CREATE POLICY appointments_consultant_update ON public.appointments
  FOR UPDATE TO authenticated
  USING (
    public.is_tenant_member(auth.uid(), tenant_id)
    AND public.get_tenant_role(auth.uid(), tenant_id) IN ('consultant','attendant')
    AND (created_by = auth.uid()
         OR (lead_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.leads l
             WHERE l.id = appointments.lead_id AND l.assigned_to = auth.uid()
         )))
  )
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- ---------------------- GAMIFICATION_EVENTS ----------------------
DROP POLICY IF EXISTS gam_events_all ON public.gamification_events;

CREATE POLICY gam_events_superadmin ON public.gamification_events
  FOR ALL TO authenticated
  USING (public.has_app_role(auth.uid(),'superadmin'))
  WITH CHECK (public.has_app_role(auth.uid(),'superadmin'));

CREATE POLICY gam_events_owner_sup ON public.gamification_events
  FOR ALL TO authenticated
  USING (public.get_tenant_role(auth.uid(), tenant_id) IN ('owner','supervisor'))
  WITH CHECK (public.get_tenant_role(auth.uid(), tenant_id) IN ('owner','supervisor'));

-- Consultor vê apenas próprios pontos
CREATE POLICY gam_events_consultant_select ON public.gamification_events
  FOR SELECT TO authenticated
  USING (
    public.is_tenant_member(auth.uid(), tenant_id)
    AND public.get_tenant_role(auth.uid(), tenant_id) IN ('consultant','attendant')
    AND member_id IN (
      SELECT id FROM public.tenant_members
       WHERE tenant_id = gamification_events.tenant_id
         AND email = (SELECT email FROM public.profiles WHERE id = auth.uid())
    )
  );

-- ---------------------- COACHING_INSIGHTS ----------------------
DROP POLICY IF EXISTS coaching_insights_all ON public.coaching_insights;

CREATE POLICY coaching_insights_superadmin ON public.coaching_insights
  FOR ALL TO authenticated
  USING (public.has_app_role(auth.uid(),'superadmin'))
  WITH CHECK (public.has_app_role(auth.uid(),'superadmin'));

CREATE POLICY coaching_insights_owner_sup ON public.coaching_insights
  FOR ALL TO authenticated
  USING (public.get_tenant_role(auth.uid(), tenant_id) IN ('owner','supervisor'))
  WITH CHECK (public.get_tenant_role(auth.uid(), tenant_id) IN ('owner','supervisor'));

-- Consultor não vê coaching da equipe; somente próprios
CREATE POLICY coaching_insights_consultant_select ON public.coaching_insights
  FOR SELECT TO authenticated
  USING (
    public.is_tenant_member(auth.uid(), tenant_id)
    AND public.get_tenant_role(auth.uid(), tenant_id) IN ('consultant','attendant')
    AND lead_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.leads l
       WHERE l.id = coaching_insights.lead_id
         AND l.assigned_to = auth.uid()
    )
  );