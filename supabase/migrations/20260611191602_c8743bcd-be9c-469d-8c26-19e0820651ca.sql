GRANT SELECT ON public.ussd_flows TO anon;
GRANT SELECT ON public.ussd_flows TO authenticated;
GRANT ALL ON public.ussd_flows TO service_role;

GRANT SELECT ON public.ussd_flow_steps TO anon;
GRANT SELECT ON public.ussd_flow_steps TO authenticated;
GRANT ALL ON public.ussd_flow_steps TO service_role;