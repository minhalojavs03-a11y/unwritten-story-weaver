
DO $$
DECLARE
  j text;
BEGIN
  FOREACH j IN ARRAY ARRAY[
    'sheets-sync-every-2min',
    'sync-nilton-leads-every-5min',
    'process-notification-queue-every-min',
    'enqueue-consultant-followups-every-10min',
    'coaching-auto-analyze-every-15min'
  ] LOOP
    BEGIN
      PERFORM cron.unschedule(j);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skip %: %', j, SQLERRM;
    END;
  END LOOP;
END $$;
