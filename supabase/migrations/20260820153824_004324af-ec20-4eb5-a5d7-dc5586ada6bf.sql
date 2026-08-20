ALTER TABLE public.providers_config DROP CONSTRAINT IF EXISTS providers_config_provider_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS providers_config_tenant_name_key
  ON public.providers_config (tenant_id, lower(provider_name));