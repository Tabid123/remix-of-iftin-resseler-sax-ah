ALTER TABLE public.providers_config ADD COLUMN IF NOT EXISTS ussd_method public.ussd_method NOT NULL DEFAULT 'single_step';
ALTER TABLE public.package_categories ADD COLUMN IF NOT EXISTS ussd_method public.ussd_method;
ALTER TABLE public.data_packages_config ADD COLUMN IF NOT EXISTS ussd_method public.ussd_method;