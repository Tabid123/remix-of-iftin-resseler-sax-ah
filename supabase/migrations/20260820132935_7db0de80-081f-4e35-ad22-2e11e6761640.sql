-- Customer-safe package view (hides cost_price and profit_margin)
DROP VIEW IF EXISTS public.customer_data_packages;

CREATE OR REPLACE VIEW public.customer_data_packages
WITH (security_invoker = on) AS
SELECT
  id,
  provider_id,
  category_id,
  package_name,
  data_amount,
  validity_days,
  selling_price,
  is_active,
  connection_type_label,
  ussd_code,
  ussd_method,
  created_at,
  updated_at,
  tenant_id
FROM public.data_packages_config
WHERE is_active = true
  AND tenant_id = public.resolve_public_tenant();

GRANT SELECT ON public.customer_data_packages TO authenticated;
GRANT SELECT ON public.customer_data_packages TO anon;
GRANT ALL ON public.customer_data_packages TO service_role;

-- Customer-safe wholesale tiers view
DROP VIEW IF EXISTS public.customer_wholesale_tiers;

CREATE OR REPLACE VIEW public.customer_wholesale_tiers
WITH (security_invoker = on) AS
SELECT
  id,
  provider_id,
  tier_name,
  min_amount,
  max_amount,
  profit_rate,
  is_active,
  display_order,
  created_at,
  updated_at,
  tenant_id
FROM public.provider_wholesale_tiers
WHERE is_active = true
  AND tenant_id = public.resolve_public_tenant();

GRANT SELECT ON public.customer_wholesale_tiers TO authenticated;
GRANT SELECT ON public.customer_wholesale_tiers TO anon;
GRANT ALL ON public.customer_wholesale_tiers TO service_role;

-- Scope public SELECT policies to the public tenant context
DROP POLICY IF EXISTS "public read packages" ON public.data_packages_config;
CREATE POLICY "public read packages"
ON public.data_packages_config
FOR SELECT
TO anon
USING (tenant_id = public.resolve_public_tenant());

DROP POLICY IF EXISTS "public read wholesale tiers" ON public.provider_wholesale_tiers;
CREATE POLICY "public read wholesale tiers"
ON public.provider_wholesale_tiers
FOR SELECT
TO anon
USING (tenant_id = public.resolve_public_tenant());

DROP POLICY IF EXISTS "public read banners" ON public.banners_config;
CREATE POLICY "public read banners"
ON public.banners_config
FOR SELECT
TO anon
USING (tenant_id = public.resolve_public_tenant());

DROP POLICY IF EXISTS "public read featured" ON public.featured_packages;
CREATE POLICY "public read featured"
ON public.featured_packages
FOR SELECT
TO anon
USING (tenant_id = public.resolve_public_tenant());

DROP POLICY IF EXISTS "public read notifications" ON public.notifications;
CREATE POLICY "public read notifications"
ON public.notifications
FOR SELECT
TO anon
USING (tenant_id = public.resolve_public_tenant());

DROP POLICY IF EXISTS "public read app_settings" ON public.app_settings;
CREATE POLICY "public read app_settings"
ON public.app_settings
FOR SELECT
TO anon
USING (tenant_id = public.resolve_public_tenant());

DROP POLICY IF EXISTS "public read errors" ON public.error_messages;
CREATE POLICY "public read errors"
ON public.error_messages
FOR SELECT
TO anon
USING (tenant_id = public.resolve_public_tenant());

DROP POLICY IF EXISTS "public read ussd_flows" ON public.ussd_flows;
CREATE POLICY "public read ussd_flows"
ON public.ussd_flows
FOR SELECT
TO anon
USING (tenant_id = public.resolve_public_tenant());

DROP POLICY IF EXISTS "public read ussd_flow_steps" ON public.ussd_flow_steps;
CREATE POLICY "public read ussd_flow_steps"
ON public.ussd_flow_steps
FOR SELECT
TO anon
USING (tenant_id = public.resolve_public_tenant());

DROP POLICY IF EXISTS "public read apk_builds" ON public.apk_builds;
CREATE POLICY "public read apk_builds"
ON public.apk_builds
FOR SELECT
TO anon
USING (tenant_id = public.resolve_public_tenant());