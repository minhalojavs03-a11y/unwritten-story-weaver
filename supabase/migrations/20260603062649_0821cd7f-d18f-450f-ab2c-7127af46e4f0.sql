CREATE POLICY "Superadmin sees all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_app_role(auth.uid(), 'superadmin'::public.app_role));