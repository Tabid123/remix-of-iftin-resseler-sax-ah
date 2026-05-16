
-- 1. Allow nullable package_id in orders for Jumlo (no package association)
ALTER TABLE public.orders ALTER COLUMN package_id DROP NOT NULL;

-- 2. Add ussd_flow_id to wholesale tiers (per-tier flow override; falls back to provider default)
ALTER TABLE public.provider_wholesale_tiers
  ADD COLUMN IF NOT EXISTS ussd_flow_id uuid REFERENCES public.ussd_flows(id) ON DELETE SET NULL;

-- 3. Extend pending_online_payments for jumlo intents
ALTER TABLE public.pending_online_payments
  ADD COLUMN IF NOT EXISTS intent_type text NOT NULL DEFAULT 'package',
  ADD COLUMN IF NOT EXISTS tier_id uuid REFERENCES public.provider_wholesale_tiers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS topup_amount numeric;

CREATE INDEX IF NOT EXISTS idx_pending_online_intent_type ON public.pending_online_payments(intent_type);

-- 4. RPC to create a jumlo reservation (mirrors create_online_payment_reservation)
CREATE OR REPLACE FUNCTION public.create_jumlo_payment_reservation(
  p_verified_phone text,
  p_sender_phone   text,
  p_data_phone     text,
  p_provider_id    uuid,
  p_tier_id        uuid,
  p_payment_provider text,
  p_expected_amount  numeric,
  p_topup_amount     numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE new_id uuid;
BEGIN
  INSERT INTO public.pending_online_payments (
    verified_phone, sender_phone, receiver_phone,
    provider_id, package_id, payment_provider,
    expected_amount, intent_type, tier_id, topup_amount
  ) VALUES (
    p_verified_phone, p_sender_phone, p_data_phone,
    p_provider_id, NULL, p_payment_provider,
    p_expected_amount, 'jumlo', p_tier_id, p_topup_amount
  )
  RETURNING id INTO new_id;

  RETURN jsonb_build_object('ok', true, 'intent_id', new_id);
END;
$$;
