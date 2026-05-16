-- Clean up delivery_notes to show ONLY the provider response text (no "Auto-resolved" prefix
-- and no "Package delivery in progress" placeholder leakage). User-facing dialog should display
-- the raw provider message only.
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
  -- Overwrite delivery_notes with ONLY the provider response (no "Auto-resolved" tag, no
  -- prior "Package delivery in progress" placeholder).
  UPDATE public.orders
  SET delivery_status = 'delivered',
      delivered_at = COALESCE(delivered_at, NOW()),
      delivery_notes = COALESCE(NULLIF(TRIM(LEFT(p_response_text, 250)), ''), 'Receiver already subscribed')
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