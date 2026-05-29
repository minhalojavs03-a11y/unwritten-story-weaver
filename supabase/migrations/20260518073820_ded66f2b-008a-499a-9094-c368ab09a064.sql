-- 1) Adicionar novos cargos ao enum app_role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supervisor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'consultant';

-- 2) Estender a tabela profiles com colunas de perfil completo
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS role_label text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS avatar_color text NOT NULL DEFAULT '#1E40AF',
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS monthly_goal integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notification_whatsapp boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notification_email boolean NOT NULL DEFAULT false;

-- 3) Constraint: bio máx 160 caracteres
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_bio_length;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_bio_length CHECK (bio IS NULL OR char_length(bio) <= 160);

-- 4) Bucket público para fotos de perfil
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 5) Policies do bucket avatars
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
CREATE POLICY "Users delete own avatar"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 6) Função para tocar last_seen_at do usuário atual (chamada do hook useUpdateLastSeen)
CREATE OR REPLACE FUNCTION public.touch_my_last_seen()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles SET last_seen_at = now() WHERE id = auth.uid();
$$;