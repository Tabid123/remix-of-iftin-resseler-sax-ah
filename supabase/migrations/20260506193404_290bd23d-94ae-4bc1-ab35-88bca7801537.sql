DO $$
DECLARE j RECORD;
BEGIN
  FOR j IN SELECT jobid FROM cron.job
           WHERE jobname IN ('auto-recover-deliveries-job','auto-recover-deliveries-30s','auto-recover-deliveries-a','auto-recover-deliveries-b')
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'auto-recover-deliveries-a',
  '* * * * *',
  $$ SELECT public.auto_recover_stuck_deliveries(); $$
);

SELECT cron.schedule(
  'auto-recover-deliveries-b',
  '* * * * *',
  $$ SELECT pg_sleep(30); SELECT public.auto_recover_stuck_deliveries(); $$
);