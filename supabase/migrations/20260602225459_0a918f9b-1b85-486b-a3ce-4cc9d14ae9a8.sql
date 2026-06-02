-- Reset history sync metadata for all already-connected instances that never completed import
-- This allows the webhook/status poller to auto-trigger admin-sync-history for them
UPDATE public.whatsapp_instances
SET metadata = COALESCE(metadata, '{}'::jsonb)
  - 'history_sync_started_at'
  - 'history_sync_completed_at'
  - 'history_sync_reason'
WHERE is_connected = true
  AND (
    metadata IS NULL
    OR metadata->'history_sync_result' IS NULL
    OR COALESCE((metadata->'history_sync_result'->>'total_chats')::int, 0) = 0
  );