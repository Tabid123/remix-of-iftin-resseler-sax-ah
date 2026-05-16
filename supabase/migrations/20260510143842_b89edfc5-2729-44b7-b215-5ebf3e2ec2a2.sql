-- Clean stale references first so FKs can be created
UPDATE public.orders o
SET intent_id = NULL
WHERE intent_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.pending_online_payments p WHERE p.id = o.intent_id);

UPDATE public.pending_online_payments p
SET tier_id = NULL
WHERE tier_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.provider_wholesale_tiers t WHERE t.id = p.tier_id);

-- Add FKs (drop-if-exists pattern)
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_intent_id_fkey;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_intent_id_fkey
  FOREIGN KEY (intent_id) REFERENCES public.pending_online_payments(id)
  ON DELETE SET NULL;

ALTER TABLE public.pending_online_payments DROP CONSTRAINT IF EXISTS pending_online_payments_tier_id_fkey;
ALTER TABLE public.pending_online_payments
  ADD CONSTRAINT pending_online_payments_tier_id_fkey
  FOREIGN KEY (tier_id) REFERENCES public.provider_wholesale_tiers(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_intent_id ON public.orders(intent_id);
CREATE INDEX IF NOT EXISTS idx_pop_tier_id ON public.pending_online_payments(tier_id);