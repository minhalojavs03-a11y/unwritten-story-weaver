
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "chat-media public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-media');

CREATE POLICY "chat-media authenticated upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-media');

CREATE POLICY "chat-media authenticated update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'chat-media');
