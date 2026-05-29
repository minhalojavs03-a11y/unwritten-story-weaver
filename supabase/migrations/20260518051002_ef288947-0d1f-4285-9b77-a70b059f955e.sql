SELECT cron.schedule(
  'sheets-sync-every-2min',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://rqaebwzoxuzfrnwdwufn.supabase.co/functions/v1/sheets-sync',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxYWVid3pveHV6ZnJud2R3dWZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNjE5NTEsImV4cCI6MjA5NDYzNzk1MX0.-B1uMdcEIISdmLqQXJogHFqHoGRy4T5EdE2YU92vdY4"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);