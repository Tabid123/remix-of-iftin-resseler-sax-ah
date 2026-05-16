CREATE OR REPLACE FUNCTION public.claim_next_delivery(p_device_id text, p_providers text[])
 RETURNS SETOF delivery_queue
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Guard: Do NOT claim if this device already has a processing delivery
  IF EXISTS (
    SELECT 1 FROM delivery_queue
    WHERE android_device_id = p_device_id
      AND status = 'processing'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE delivery_queue
  SET status = 'processing',
      android_device_id = p_device_id,
      last_attempt_at = NOW()
  WHERE id = (
    SELECT id FROM delivery_queue
    WHERE status = 'pending'
      AND provider_name = ANY(p_providers)
      AND (scheduled_at IS NULL OR scheduled_at <= NOW())
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$function$;

-- Reset all stuck "processing" items older than 5 minutes back to "pending"
UPDATE delivery_queue
SET status = 'pending',
    android_device_id = NULL,
    error_message = 'Auto-reset: stuck in processing'
WHERE status = 'processing'
  AND last_attempt_at < NOW() - INTERVAL '5 minutes';