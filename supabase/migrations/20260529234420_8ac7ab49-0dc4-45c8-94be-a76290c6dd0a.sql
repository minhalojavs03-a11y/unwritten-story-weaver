DROP POLICY IF EXISTS sheet_sync_cfg_all ON public.sheet_sync_config;
DROP POLICY IF EXISTS sheet_sync_logs_all ON public.sheet_sync_logs;

CREATE POLICY sheet_sync_cfg_all ON public.sheet_sync_config
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id) OR public.has_app_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id) OR public.has_app_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY sheet_sync_logs_all ON public.sheet_sync_logs
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id) OR public.has_app_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id) OR public.has_app_role(auth.uid(), 'superadmin'::app_role));