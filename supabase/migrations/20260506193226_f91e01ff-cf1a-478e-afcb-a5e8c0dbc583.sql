-- Update auto_recover_stuck_deliveries: 60s timeout, defer retry by 30s, max 3 attempts
CREATE OR REPLACE FUNCTION public.auto_recover_stuck_deliveries()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_queue_retried INTEGER := 0;
  v_queue_failed INTEGER := 0;
  v_orders_failed INTEGER := 0;
  v_orders_reset INTEGER := 0;
BEGIN
  -- Stuck rows that still have retries left → defer 30s for retry, free SIM immediately
  WITH retry_rows AS (
    UPDATE public.delivery_queue
    SET status = 'pending',
        android_device_id = NULL,
        attempts = COALESCE(attempts, 0) + 1,
        scheduled_at = NOW() + INTERVAL '30 seconds',
        last_attempt_at = NULL,
        error_message = 'Auto-recovered: 60s timeout, retry scheduled (' || (COALESCE(attempts,0)+1)::text || '/3)'
    WHERE status = 'processing'
      AND COALESCE(last_attempt_at, created_at) < NOW() - INTERVAL '60 seconds'
      AND COALESCE(attempts, 0) < 2
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_queue_retried FROM retry_rows;

  -- Stuck rows exhausted (already attempted 2 times → this is the 3rd) → fail
  WITH failed_rows AS (
    UPDATE public.delivery_queue
    SET status = 'failed',
        completed_at = NOW(),
        error_message = 'Failed after 3 attempts (60s timeout each)'
    WHERE status = 'processing'
      AND COALESCE(last_attempt_at, created_at) < NOW() - INTERVAL '60 seconds'
      AND COALESCE(attempts, 0) >= 2
    RETURNING order_id
  ),
  fail_orders AS (
    UPDATE public.orders
    SET delivery_status = 'failed',
        delivery_notes = COALESCE(delivery_notes, '') || ' [Auto-failed: 3x 60s timeout]'
    WHERE id IN (SELECT order_id FROM failed_rows)
      AND delivery_status NOT IN ('delivered', 'cancelled', 'failed')
    RETURNING 1
  )
  SELECT (SELECT COUNT(*) FROM failed_rows), (SELECT COUNT(*) FROM fail_orders)
  INTO v_queue_failed, v_orders_failed;

  -- Stuck orders with no active queue rows → re-queue or fail
  WITH stuck_orders AS (
    SELECT orders.id,
           (SELECT COALESCE(MAX(attempts), 0) FROM delivery_queue dq WHERE dq.order_id = orders.id) AS qattempts
    FROM public.orders
    WHERE delivery_status = 'processing'
      AND updated_at < NOW() - INTERVAL '60 seconds'
      AND NOT EXISTS (
        SELECT 1 FROM public.delivery_queue dq
        WHERE dq.order_id = orders.id
          AND dq.status IN ('pending', 'processing')
      )
  ),
  reset_to_queued AS (
    UPDATE public.orders
    SET delivery_status = 'queued',
        delivery_notes = COALESCE(delivery_notes, '') || ' [Auto-recovered]'
    WHERE id IN (SELECT id FROM stuck_orders WHERE qattempts < 3)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_orders_reset FROM reset_to_queued;

  RETURN json_build_object(
    'queue_retried', v_queue_retried,
    'queue_failed', v_queue_failed,
    'orders_failed', v_orders_failed,
    'orders_reset_to_queued', v_orders_reset,
    'timestamp', NOW()
  );
END;
$function$;

-- Update claim_next_delivery: 60s threshold, respect scheduled_at, allow other orders to proceed while one is deferred
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

  -- Fail rows that already exhausted retries
  UPDATE public.delivery_queue
  SET status = 'failed',
      completed_at = NOW(),
      error_message = 'Failed after 3 attempts (60s timeout each)'
  WHERE android_device_id = p_device_id
    AND status = 'processing'
    AND COALESCE(last_attempt_at, created_at) < NOW() - INTERVAL '60 seconds'
    AND COALESCE(attempts, 0) >= 2;

  -- If device is currently busy (recent processing row), do nothing
  IF EXISTS (
    SELECT 1 FROM public.delivery_queue
    WHERE android_device_id = p_device_id
      AND status = 'processing'
      AND COALESCE(last_attempt_at, created_at) >= NOW() - INTERVAL '60 seconds'
  ) THEN
    RETURN;
  END IF;

  -- Claim next eligible row: skip deferred (scheduled_at in future), prefer FIFO
  RETURN QUERY
  UPDATE public.delivery_queue
  SET status = 'processing',
      android_device_id = p_device_id,
      last_attempt_at = NOW()
  WHERE id = (
    SELECT id FROM public.delivery_queue
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