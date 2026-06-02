UPDATE public.whatsapp_instances
SET metadata = (coalesce(metadata,'{}'::jsonb) - 'history_sync_started_at' - 'history_sync_completed_at' - 'history_sync_result' - 'history_sync_reason')
WHERE id = 'b22afc4f-4b68-4bf5-9586-16a23ff19cd2';