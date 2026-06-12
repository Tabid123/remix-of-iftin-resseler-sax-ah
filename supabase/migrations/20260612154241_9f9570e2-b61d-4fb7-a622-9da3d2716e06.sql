ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_queue;
ALTER TABLE public.delivery_queue REPLICA IDENTITY FULL;