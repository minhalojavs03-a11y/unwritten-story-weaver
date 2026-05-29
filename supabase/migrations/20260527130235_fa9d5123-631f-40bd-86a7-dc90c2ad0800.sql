CREATE POLICY "Supervisors update tenant_members"
ON public.tenant_members
FOR UPDATE
TO authenticated
USING (is_tenant_staff(tenant_id) AND has_role(auth.uid(), 'supervisor'::app_role))
WITH CHECK (is_tenant_staff(tenant_id) AND has_role(auth.uid(), 'supervisor'::app_role));