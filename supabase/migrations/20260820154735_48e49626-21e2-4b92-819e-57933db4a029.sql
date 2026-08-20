ALTER TABLE public.payment_providers_config
  DROP CONSTRAINT IF EXISTS payment_providers_config_provider_name_key;

DROP INDEX IF EXISTS public.payment_providers_config_provider_name_key;
DROP INDEX IF EXISTS public.payment_providers_config_tenant_provider_name_uidx;

CREATE UNIQUE INDEX payment_providers_config_tenant_provider_name_uidx
  ON public.payment_providers_config (tenant_id, lower(provider_name))
  WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payment_providers_config_legacy_provider_name_uidx
  ON public.payment_providers_config (lower(provider_name))
  WHERE tenant_id IS NULL;