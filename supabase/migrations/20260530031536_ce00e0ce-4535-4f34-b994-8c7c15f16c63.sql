
-- Limpa linhas órfãs antes de criar as FKs
UPDATE public.conversations SET lead_id = NULL WHERE lead_id IS NOT NULL AND lead_id NOT IN (SELECT id FROM public.leads);
UPDATE public.messages SET lead_id = NULL WHERE lead_id IS NOT NULL AND lead_id NOT IN (SELECT id FROM public.leads);
UPDATE public.messages SET conversation_id = NULL WHERE conversation_id IS NOT NULL AND conversation_id NOT IN (SELECT id FROM public.conversations);

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;

-- Recarrega o schema cache do PostgREST para reconhecer as novas relações
NOTIFY pgrst, 'reload schema';
