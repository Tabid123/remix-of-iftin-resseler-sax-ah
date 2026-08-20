-- Remove public read policies that expose sensitive columns
DROP POLICY IF EXISTS "public read delivery_instructions" ON public.delivery_instructions;
DROP POLICY IF EXISTS "public read payment_providers" ON public.payment_providers_config;
DROP POLICY IF EXISTS "public read providers" ON public.providers_config;

-- Customer-safe view for delivery instructions (hides sim_password)
CREATE OR REPLACE VIEW public.customer_delivery_instructions AS
SELECT
  id,
  provider_id,
  category_id,
  package_id,
  instruction_template,
  code_template,
  notes,
  ussd_method,
  created_at,
  updated_at,
  tenant_id
FROM public.delivery_instructions
WHERE tenant_id = public.current_tenant_id() OR tenant_id IS NULL;

-- Grant access to the safe view
GRANT SELECT ON public.customer_delivery_instructions TO authenticated;
GRANT SELECT ON public.customer_delivery_instructions TO anon;
GRANT ALL ON public.customer_delivery_instructions TO service_role;