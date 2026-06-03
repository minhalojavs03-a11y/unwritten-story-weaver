-- Remove a policy genérica de "owner" e substitui por acesso específico da Ediane
DROP POLICY IF EXISTS "nilton_leads owner select" ON public.nilton_leads;
DROP POLICY IF EXISTS "nilton_leads owner update" ON public.nilton_leads;

CREATE POLICY "nilton_leads ediane select"
ON public.nilton_leads
FOR SELECT
TO authenticated
USING (auth.uid() = '714d4db0-4f5a-4b95-8d46-962111d9e92e'::uuid);

CREATE POLICY "nilton_leads ediane update"
ON public.nilton_leads
FOR UPDATE
TO authenticated
USING (auth.uid() = '714d4db0-4f5a-4b95-8d46-962111d9e92e'::uuid)
WITH CHECK (auth.uid() = '714d4db0-4f5a-4b95-8d46-962111d9e92e'::uuid);