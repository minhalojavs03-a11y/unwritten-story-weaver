CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove versão anterior (se houver) e cria nova com 2 minutos
DO $$
BEGIN
  PERFORM cron.unschedule('sheets-sync-every-2min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'sheets-sync-every-2min',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qwoilgpbxxzjzpltosas.supabase.co/functions/v1/sheets-sync',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3b2lsZ3BieHh6anpwbHRvc2FzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMTMwNDcsImV4cCI6MjA5NTU4OTA0N30.sN9rsxat2Vo-D8xhsZ5UzgLw3zhKRhjcepzZgdwAqZ8"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);