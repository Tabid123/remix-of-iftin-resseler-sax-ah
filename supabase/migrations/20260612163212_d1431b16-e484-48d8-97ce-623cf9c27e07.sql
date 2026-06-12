DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'delivery_queue'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_queue;
  END IF;
END $$;
ALTER TABLE public.delivery_queue REPLICA IDENTITY FULL;