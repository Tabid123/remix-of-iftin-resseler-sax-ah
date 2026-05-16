CREATE OR REPLACE FUNCTION public.claim_next_delivery(p_device_id text, p_providers text[])
RETURNS SETOF public.delivery_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Auto-release stale processing rows owned by this device (60s) → defer retry by 30s
  UPDATE public.delivery_queue
  SET status = 'pending',
      android_device_id = NULL,
      attempts = COALESCE(attempts, 0) + 1,
      scheduled_at = NOW() + INTERVAL '30 seconds',
      last_attempt_at = NULL,
      error_message = 'Auto-reset: 60s timeout, retry scheduled (' || (COALESCE(attempts,0)+1)::text || '/3)'
  WHERE android_device_id = p_device_id
    AND status = 'processing'
    AND COALESCE(last_attempt_at, created_at) < NOW() - INTERVAL '60 seconds'
    AND COALESCE(attempts, 0) < 2;

  UPDATE public.delivery_queue
  SET status = 'failed',
      completed_at = NOW(),
      error_message = 'Failed after 3 attempts (60s timeout each)'
  WHERE android_device_id = p_device_id
    AND status = 'processing'
    AND COALESCE(last_attempt_at, created_at) < NOW() - INTERVAL '60 seconds'
    AND COALESCE(attempts, 0) >= 2;

  IF EXISTS (
    SELECT 1 FROM public.delivery_queue
    WHERE android_device_id = p_device_id
      AND status = 'processing'
      AND COALESCE(last_attempt_at, created_at) >= NOW() - INTERVAL '60 seconds'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.delivery_queue
  SET status = 'processing',
      android_device_id = p_device_id,
      last_attempt_at = NOW()
  WHERE id = (
    SELECT id FROM public.delivery_queue
    WHERE status = 'pending'
      AND lower(provider_name) = ANY(SELECT lower(unnest(p_providers)))
      AND (scheduled_at IS NULL OR scheduled_at <= NOW())
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$function$;

-- Also fix the two old pending rows whose USSD was generated before the rate fix (still *050* instead of *058*)
UPDATE public.delivery_queue
SET ussd_code = '*726*619535029*058*5516#'
WHERE id IN ('2028cce0-480d-4b62-8750-5cf319f47654','f4785564-9626-4ac9-ac75-37c88980551d')
  AND status = 'pending';