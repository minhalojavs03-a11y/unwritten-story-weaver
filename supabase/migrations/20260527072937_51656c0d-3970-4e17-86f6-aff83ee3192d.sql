
-- 1. Coluna de pontuação para simulação enviada
ALTER TABLE public.gamification_config
  ADD COLUMN IF NOT EXISTS points_simulation_sent integer NOT NULL DEFAULT 30;

-- 2. Cron job para análise automática de simulações (a cada 3 min)
SELECT cron.unschedule('simulation-auto-analyze')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'simulation-auto-analyze');

SELECT cron.schedule(
  'simulation-auto-analyze',
  '*/3 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://rqaebwzoxuzfrnwdwufn.supabase.co/functions/v1/analyze-simulations',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxYWVid3pveHV6ZnJud2R3dWZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNjE5NTEsImV4cCI6MjA5NDYzNzk1MX0.-B1uMdcEIISdmLqQXJogHFqHoGRy4T5EdE2YU92vdY4'
    ),
    body := jsonb_build_object('cron', true, 'days', 2, 'limit', 40)
  );
  $$
);
