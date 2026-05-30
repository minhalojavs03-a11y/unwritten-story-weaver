INSERT INTO public.tenant_memberships (tenant_id, user_id, role, display_name)
VALUES ('9ecb99e2-50ee-404f-920b-81cd94cc685e', '6216d5c1-5b32-4660-acc5-66f844f77f11', 'owner', 'Arley Davies')
ON CONFLICT (tenant_id, user_id) DO NOTHING;

UPDATE public.profiles SET tenant_id = '9ecb99e2-50ee-404f-920b-81cd94cc685e'
WHERE id = '6216d5c1-5b32-4660-acc5-66f844f77f11';

CREATE POLICY "whatsapp_instances_superadmin_all"
ON public.whatsapp_instances
FOR ALL TO authenticated
USING (public.has_app_role(auth.uid(), 'superadmin'))
WITH CHECK (public.has_app_role(auth.uid(), 'superadmin'));