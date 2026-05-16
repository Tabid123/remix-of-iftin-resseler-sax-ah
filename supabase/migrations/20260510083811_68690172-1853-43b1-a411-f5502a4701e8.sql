
CREATE TABLE IF NOT EXISTS public.ussd_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_name text NOT NULL,
  trigger_code text NOT NULL,
  provider_id uuid REFERENCES public.providers_config(id) ON DELETE SET NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ussd_flow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.ussd_flows(id) ON DELETE CASCADE,
  step_order integer NOT NULL DEFAULT 1,
  match_keywords text[] NOT NULL DEFAULT '{}',
  response_template text NOT NULL DEFAULT '',
  is_pin_field boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ussd_flow_steps_flow ON public.ussd_flow_steps(flow_id, step_order);

ALTER TABLE public.ussd_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ussd_flow_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin all ussd_flows" ON public.ussd_flows;
CREATE POLICY "admin all ussd_flows" ON public.ussd_flows
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "public read ussd_flows" ON public.ussd_flows;
CREATE POLICY "public read ussd_flows" ON public.ussd_flows FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin all ussd_flow_steps" ON public.ussd_flow_steps;
CREATE POLICY "admin all ussd_flow_steps" ON public.ussd_flow_steps
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "public read ussd_flow_steps" ON public.ussd_flow_steps;
CREATE POLICY "public read ussd_flow_steps" ON public.ussd_flow_steps FOR SELECT USING (true);

DROP TRIGGER IF EXISTS update_ussd_flows_updated_at ON public.ussd_flows;
CREATE TRIGGER update_ussd_flows_updated_at BEFORE UPDATE ON public.ussd_flows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_ussd_flow_steps_updated_at ON public.ussd_flow_steps;
CREATE TRIGGER update_ussd_flow_steps_updated_at BEFORE UPDATE ON public.ussd_flow_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DELETE FROM public.app_settings WHERE setting_key LIKE 'ussd_725_step%';
