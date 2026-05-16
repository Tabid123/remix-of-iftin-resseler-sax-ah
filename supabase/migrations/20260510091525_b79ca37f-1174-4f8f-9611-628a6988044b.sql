
ALTER TABLE public.providers_config
  ADD COLUMN IF NOT EXISTS ussd_flow_id uuid REFERENCES public.ussd_flows(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ussd_single_template text;

COMMENT ON COLUMN public.providers_config.ussd_flow_id IS 'When ussd_method=interactive, references the ussd_flows row to use for this provider.';
COMMENT ON COLUMN public.providers_config.ussd_single_template IS 'When ussd_method=single_step, the USSD short-code template (e.g. *712*{amount}*{receiver}*{pin}#).';
