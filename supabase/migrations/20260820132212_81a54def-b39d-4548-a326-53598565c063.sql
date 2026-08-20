-- Restrict anonymous users from reading sensitive columns while keeping them available to service/admin roles
REVOKE SELECT (sim_password) ON public.delivery_instructions FROM anon;
REVOKE SELECT (api_credentials, payment_number) ON public.payment_providers_config FROM anon;
REVOKE SELECT (api_key, api_endpoint) ON public.providers_config FROM anon;

-- Explicitly preserve full access for service_role (already has ALL, but made explicit for clarity)
GRANT SELECT (sim_password) ON public.delivery_instructions TO service_role;
GRANT SELECT (api_credentials, payment_number) ON public.payment_providers_config TO service_role;
GRANT SELECT (api_key, api_endpoint) ON public.providers_config TO service_role;