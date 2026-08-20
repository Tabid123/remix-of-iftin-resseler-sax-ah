-- Recreate the customer-safe view as a security invoker view
DROP VIEW IF EXISTS public.customer_delivery_instructions;

CREATE OR REPLACE VIEW public.customer_delivery_instructions
WITH (security_invoker = on) AS
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

-- Authenticated users need SELECT on the base table for a security-invoker view
GRANT SELECT ON public.delivery_instructions TO authenticated;

-- Tenant-scoped read policy for the base table
DROP POLICY IF EXISTS "tenant members read delivery instructions" ON public.delivery_instructions;
CREATE POLICY "tenant members read delivery instructions"
ON public.delivery_instructions
FOR SELECT
TO authenticated
USING (tenant_id = public.current_tenant_id() OR tenant_id IS NULL);