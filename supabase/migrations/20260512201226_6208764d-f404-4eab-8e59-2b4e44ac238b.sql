-- Backfill pin_code for any active delivery_queue rows missing it,
-- so the Android USSD flow can complete instead of aborting "Invalid PIN".
-- Uses provider default sim_password from delivery_instructions when available,
-- otherwise falls back to the canonical default '5516'.
UPDATE public.delivery_queue dq
SET pin_code = COALESCE(
  (
    SELECT NULLIF(regexp_replace(TRIM(di.sim_password), '[^0-9]', '', 'g'), '')
    FROM public.delivery_instructions di
    JOIN public.providers_config pc ON pc.id = di.provider_id
    WHERE LOWER(pc.provider_name) LIKE '%' || LOWER(dq.provider_name) || '%'
      AND di.sim_password IS NOT NULL
      AND di.category_id IS NULL
      AND di.package_id IS NULL
    LIMIT 1
  ),
  '5516'
)
WHERE dq.status IN ('pending','processing','scheduled')
  AND (dq.pin_code IS NULL OR TRIM(dq.pin_code) = '');