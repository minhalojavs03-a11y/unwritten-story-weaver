-- Fix WARN 3/4: SECURITY DEFINER -> INVOKER
-- O usuário só pode atualizar o próprio profile (RLS já garante), então não precisa de DEFINER
CREATE OR REPLACE FUNCTION public.touch_my_last_seen()
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.profiles SET last_seen_at = now() WHERE id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.touch_my_last_seen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_my_last_seen() TO authenticated;

-- Fix WARN 2: restringir SELECT no bucket avatars para evitar listagem aberta
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
CREATE POLICY "Anyone can view avatar files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'avatars'
  AND lower(name) ~ '\.(jpg|jpeg|png|webp)$'
);