
-- Bucket público para mídias de conversas (áudios, imagens, vídeos, documentos, stickers)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Leitura pública (URLs assinadas não são necessárias; mídia já passa pela edge function)
CREATE POLICY "chat-media public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-media');

-- Upload/atualização/deleção restritos: somente service_role (edge function) e membros autenticados do tenant
CREATE POLICY "chat-media auth insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-media');

CREATE POLICY "chat-media auth update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'chat-media');

CREATE POLICY "chat-media auth delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-media');
