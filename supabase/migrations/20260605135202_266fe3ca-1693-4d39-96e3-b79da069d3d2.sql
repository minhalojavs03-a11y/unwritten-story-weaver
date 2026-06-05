
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('process-notification-queue-every-min','enqueue-consultant-followups-every-10min');

SELECT cron.schedule(
  'process-notification-queue-every-min',
  '* * * * *',
  $$SELECT net.http_post(
    url := 'https://qwoilgpbxxzjzpltosas.supabase.co/functions/v1/process-notification-queue',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3b2lsZ3BieHh6anpwbHRvc2FzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMTMwNDcsImV4cCI6MjA5NTU4OTA0N30.sN9rsxat2Vo-D8xhsZ5UzgLw3zhKRhjcepzZgdwAqZ8"}'::jsonb,
    body := '{}'::jsonb
  );$$
);

SELECT cron.schedule(
  'enqueue-consultant-followups-every-10min',
  '*/10 * * * *',
  $$SELECT net.http_post(
    url := 'https://qwoilgpbxxzjzpltosas.supabase.co/functions/v1/enqueue-consultant-followups',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3b2lsZ3BieHh6anpwbHRvc2FzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMTMwNDcsImV4cCI6MjA5NTU4OTA0N30.sN9rsxat2Vo-D8xhsZ5UzgLw3zhKRhjcepzZgdwAqZ8"}'::jsonb,
    body := '{}'::jsonb
  );$$
);
