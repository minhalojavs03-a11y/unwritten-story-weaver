
SELECT cron.schedule(
  'sync-nilton-leads-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qwoilgpbxxzjzpltosas.supabase.co/functions/v1/sync-nilton-leads',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3b2lsZ3BieHh6anpwbHRvc2FzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMTMwNDcsImV4cCI6MjA5NTU4OTA0N30.sN9rsxat2Vo-D8xhsZ5UzgLw3zhKRhjcepzZgdwAqZ8"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
