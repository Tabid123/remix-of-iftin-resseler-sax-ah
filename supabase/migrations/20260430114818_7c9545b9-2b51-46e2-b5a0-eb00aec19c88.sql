
-- 1) claim_next_delivery: 50s timeout, NO per-device blocking guard
CREATE OR REPLACE FUNCTION public.claim_next_delivery(p_device_id text, p_providers text[])
 RETURNS SETOF delivery_queue
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- GLOBAL release: any 'processing' row older than 50s gets pushed back to pending
  UPDATE public.delivery_queue
  SET status = 'pending',
      android_device_id = NULL,
      attempts = COALESCE(attempts, 0) + 1,
      error_message = 'Auto-released: stuck >50s'
  WHERE status = 'processing'
    AND COALESCE(last_attempt_at, created_at) < NOW() - INTERVAL '50 seconds';

  -- NOTE: We deliberately DO NOT block this device from claiming a new order
  -- even if it has another row still processing. FOR UPDATE SKIP LOCKED below
  -- guarantees no duplicate claims, and the 50s sweep above unblocks the queue
  -- so admin-stuck rows never freeze the entire device pipeline.

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

-- 2) auto_recover_stuck_deliveries: align to 50s
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
        error_message = 'Auto-recovered: stuck in processing >50s'
    WHERE status = 'processing'
      AND COALESCE(last_attempt_at, created_at) < NOW() - INTERVAL '50 seconds'
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
        AND updated_at < NOW() - INTERVAL '3 minutes'
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

-- 3) mark_order_already_subscribed: handles "horey ayuu u furtay / Dhammays"
CREATE OR REPLACE FUNCTION public.mark_order_already_subscribed(p_order_id uuid, p_response_text text DEFAULT NULL)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  -- Mark order delivered (customer already paid; provider says receiver already has the package)
  UPDATE public.orders
  SET delivery_status = 'delivered',
      delivered_at = COALESCE(delivered_at, NOW()),
      delivery_notes = COALESCE(delivery_notes, '') ||
                       ' [Auto-resolved: receiver already subscribed - ' ||
                       COALESCE(LEFT(p_response_text, 120), 'no text') || ']'
  WHERE id = p_order_id
    AND delivery_status NOT IN ('delivered', 'cancelled');
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Close any active queue rows for this order so it never retries
  UPDATE public.delivery_queue
  SET status = 'completed',
      error_message = COALESCE(error_message, '') || ' [Auto: already subscribed]'
  WHERE order_id = p_order_id
    AND status IN ('pending', 'processing');

  RETURN json_build_object('success', true, 'order_updated', v_updated);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.mark_order_already_subscribed(uuid, text) TO authenticated, anon, service_role;
