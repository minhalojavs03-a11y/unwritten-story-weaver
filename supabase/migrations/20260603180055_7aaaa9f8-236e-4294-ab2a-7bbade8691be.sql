DROP POLICY IF EXISTS "Owner can update tenant" ON public.tenants;
CREATE POLICY "Owner or supervisor can update tenant"
ON public.tenants FOR UPDATE
USING (
  get_tenant_role(auth.uid(), id) IN ('owner'::tenant_role, 'supervisor'::tenant_role)
  OR has_app_role(auth.uid(), 'superadmin'::app_role)
);