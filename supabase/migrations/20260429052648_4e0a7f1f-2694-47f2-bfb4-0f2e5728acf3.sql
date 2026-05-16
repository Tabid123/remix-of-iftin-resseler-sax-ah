
-- 1) Add unique intent_id column to orders for hard idempotency
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS intent_id UUID;

-- Partial unique index: only enforce uniqueness when intent_id is set
CREATE UNIQUE INDEX IF NOT EXISTS orders_intent_id_unique_idx
  ON public.orders(intent_id)
  WHERE intent_id IS NOT NULL;

-- 2) Helpful indexes for matching
CREATE INDEX IF NOT EXISTS pop_sender_status_amount_idx
  ON public.pending_online_payments(sender_phone, status, expected_amount, created_at DESC);

CREATE INDEX IF NOT EXISTS pop_verified_status_amount_idx
  ON public.pending_online_payments(verified_phone, status, expected_amount, created_at DESC);

-- 3) Server-side reservation RPC: normalize, dedup, atomic insert
CREATE OR REPLACE FUNCTION public.create_online_payment_reservation(
  p_verified_phone TEXT,
  p_sender_phone TEXT,
  p_receiver_phone TEXT,
  p_provider_id UUID,
  p_package_id UUID,
  p_payment_provider TEXT,
  p_expected_amount NUMERIC
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm_sender TEXT;
  v_norm_receiver TEXT;
  v_norm_verified TEXT;
  v_existing_id UUID;
  v_new_id UUID;
BEGIN
  -- Normalize phones to canonical 9-digit
  v_norm_sender := regexp_replace(coalesce(p_sender_phone,''), '\D', '', 'g');
  IF v_norm_sender ~ '^252' AND length(v_norm_sender) >= 12 THEN
    v_norm_sender := substring(v_norm_sender from 4);
  END IF;
  IF v_norm_sender ~ '^0' AND length(v_norm_sender) = 10 THEN
    v_norm_sender := substring(v_norm_sender from 2);
  END IF;
  v_norm_sender := right(v_norm_sender, 9);

  v_norm_receiver := regexp_replace(coalesce(p_receiver_phone,''), '\D', '', 'g');
  IF v_norm_receiver ~ '^252' AND length(v_norm_receiver) >= 12 THEN
    v_norm_receiver := substring(v_norm_receiver from 4);
  END IF;
  IF v_norm_receiver ~ '^0' AND length(v_norm_receiver) = 10 THEN
    v_norm_receiver := substring(v_norm_receiver from 2);
  END IF;
  v_norm_receiver := right(v_norm_receiver, 9);

  v_norm_verified := regexp_replace(coalesce(p_verified_phone,''), '\D', '', 'g');
  IF v_norm_verified ~ '^252' AND length(v_norm_verified) >= 12 THEN
    v_norm_verified := substring(v_norm_verified from 4);
  END IF;
  IF v_norm_verified ~ '^0' AND length(v_norm_verified) = 10 THEN
    v_norm_verified := substring(v_norm_verified from 2);
  END IF;
  v_norm_verified := right(v_norm_verified, 9);

  -- Validation
  IF length(v_norm_sender) <> 9 OR length(v_norm_receiver) < 7 OR p_expected_amount IS NULL OR p_expected_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'invalid_input');
  END IF;

  -- Block check
  IF EXISTS (SELECT 1 FROM public.blocked_users WHERE phone_number = v_norm_sender AND is_active = true) THEN
    RETURN json_build_object('success', false, 'error', 'blocked');
  END IF;

  -- Dedup: same sender + package + amount within last 5 minutes => reuse
  SELECT id INTO v_existing_id
  FROM public.pending_online_payments
  WHERE sender_phone = v_norm_sender
    AND package_id = p_package_id
    AND expected_amount = p_expected_amount
    AND status = 'pending'
    AND created_at >= now() - interval '5 minutes'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN json_build_object('success', true, 'intent_id', v_existing_id, 'reused', true);
  END IF;

  -- Insert
  INSERT INTO public.pending_online_payments (
    verified_phone, sender_phone, receiver_phone,
    provider_id, package_id, payment_provider,
    expected_amount, status
  ) VALUES (
    v_norm_verified, v_norm_sender, v_norm_receiver,
    p_provider_id, p_package_id, p_payment_provider,
    p_expected_amount, 'pending'
  )
  RETURNING id INTO v_new_id;

  RETURN json_build_object('success', true, 'intent_id', v_new_id, 'reused', false);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_online_payment_reservation(TEXT,TEXT,TEXT,UUID,UUID,TEXT,NUMERIC) TO anon, authenticated;

-- 4) Recovery RPC: re-match unmatched payment_receipts against late intents
CREATE OR REPLACE FUNCTION public.recover_unmatched_online_payments(p_hours INTEGER DEFAULT 48)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recovered INTEGER := 0;
  r RECORD;
  v_intent RECORD;
BEGIN
  FOR r IN
    SELECT id, sender_phone, amount
    FROM public.payment_receipts
    WHERE status = 'unmatched'
      AND created_at >= now() - (p_hours || ' hours')::interval
      AND matched_order_id IS NULL
    ORDER BY created_at ASC
  LOOP
    -- Find pending intent matching sender + amount within window
    SELECT * INTO v_intent
    FROM public.pending_online_payments
    WHERE (sender_phone = r.sender_phone OR verified_phone = r.sender_phone)
      AND expected_amount = r.amount
      AND status = 'pending'
      AND created_at >= now() - (p_hours || ' hours')::interval
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      -- Mark intent matched (lock)
      UPDATE public.pending_online_payments SET status = 'matched'
      WHERE id = v_intent.id AND status = 'pending';

      -- Mark receipt for reprocessing (process-payment-receipt edge will reattempt)
      UPDATE public.payment_receipts
      SET status = 'pending',
          admin_notes = COALESCE(admin_notes,'') || ' | Recovered for re-match by recover_unmatched_online_payments'
      WHERE id = r.id;

      v_recovered := v_recovered + 1;
    END IF;
  END LOOP;

  RETURN json_build_object('recovered', v_recovered, 'window_hours', p_hours);
END;
$$;

GRANT EXECUTE ON FUNCTION public.recover_unmatched_online_payments(INTEGER) TO authenticated;
