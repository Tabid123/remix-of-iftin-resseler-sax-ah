-- Rewrite claim_next_delivery: no per-device blocking, 5-min stale auto-reset, atomic per-row lock
CREATE OR REPLACE FUNCTION public.claim_next_delivery(p_device_id text, p_providers text[])
 RETURNS SETOF public.delivery_queue
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Auto-release ANY row stuck in 'processing' for more than 5 minutes
  -- (regardless of which device owned it). Next poll will re-claim it.
  UPDATE public.delivery_queue
  SET status = 'pending',
      android_device_id = NULL,
      attempts = COALESCE(attempts, 0) + 1,
      error_message = 'Auto-released: stuck in processing >5 minutes'
  WHERE status = 'processing'
    AND COALESCE(last_attempt_at, created_at) < NOW() - INTERVAL '5 minutes';

  -- Atomically claim the next eligible pending row.
  -- FOR UPDATE SKIP LOCKED locks ONLY this row, so concurrent device polls
  -- never block each other and stuck/processing rows do not gate the queue.
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

-- Update auto_recover_stuck_deliveries: bump processing threshold 50s -> 5 minutes
CREATE OR REPLACE FUNCTION public.auto_recover_stuck_deliveries()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_queue_reset INTEGER := 0;
  v_orders_reset INTEGER := 0;
  v_orders_failed INTEGER := 0;
BEGIN
  WITH reset AS (
    UPDATE public.delivery_queue
    SET status = 'pending',
        android_device_id = NULL,
        attempts = COALESCE(attempts, 0) + 1,
        error_message = 'Auto-recovered: stuck in processing >5 minutes'
    WHERE status = 'processing'
      AND COALESCE(last_attempt_at, created_at) < NOW() - INTERVAL '5 minutes'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_queue_reset FROM reset;

  WITH stuck_orders AS (
    SELECT o.id, COALESCE(o.attempts_via_queue, 0) AS qattempts
    FROM (
      SELECT orders.id,
             (SELECT COALESCE(MAX(attempts), 0)
              FROM delivery_queue dq
              WHERE dq.order_id = orders.id) AS attempts_via_queue
      FROM public.orders
      WHERE delivery_status = 'processing'
        AND updated_at < NOW() - INTERVAL '5 minutes'
        AND NOT EXISTS (
          SELECT 1 FROM public.delivery_queue dq
          WHERE dq.order_id = orders.id
            AND dq.status IN ('pending', 'processing')
        )
    ) o
  ),
  reset_to_queued AS (
    UPDATE public.orders
    SET delivery_status = 'queued',
        delivery_notes = COALESCE(delivery_notes, '') || ' [Auto-recovered]'
    WHERE id IN (SELECT id FROM stuck_orders WHERE qattempts < 3)
    RETURNING 1
  ),
  fail_exhausted AS (
    UPDATE public.orders
    SET delivery_status = 'failed',
        delivery_notes = COALESCE(delivery_notes, '') || ' [Auto-failed: exhausted retries]'
    WHERE id IN (SELECT id FROM stuck_orders WHERE qattempts >= 3)
    RETURNING 1
  )
  SELECT
    (SELECT COUNT(*) FROM reset_to_queued),
    (SELECT COUNT(*) FROM fail_exhausted)
  INTO v_orders_reset, v_orders_failed;

  RETURN json_build_object(
    'queue_reset', v_queue_reset,
    'orders_reset_to_queued', v_orders_reset,
    'orders_marked_failed', v_orders_failed,
    'timestamp', NOW()
  );
END;
$function$;