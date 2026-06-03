-- Enable required extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any prior version of this job
DO $$
DECLARE j RECORD;
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE jobname = 'coaching-auto-analyze-every-15min' LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

-- Schedule automatic coaching analysis every 15 minutes (last 2 days, up to 80 msgs per tenant)
SELECT cron.schedule(
  'coaching-auto-analyze-every-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qwoilgpbxxzjzpltosas.supabase.co/functions/v1/backfill-coaching',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3b2lsZ3BieHh6anpwbHRvc2FzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMTMwNDcsImV4cCI6MjA5NTU4OTA0N30.sN9rsxat2Vo-D8xhsZ5UzgLw3zhKRhjcepzZgdwAqZ8"}'::jsonb,
    body := '{"cron":true,"days":2,"limit":80}'::jsonb
  );
  $$
);