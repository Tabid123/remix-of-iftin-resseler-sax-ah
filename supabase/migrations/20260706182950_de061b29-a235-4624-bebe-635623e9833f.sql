
-- Table to log dialogs that don't match any known step
CREATE TABLE IF NOT EXISTS public.ussd_unmatched_dialogs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_id UUID REFERENCES public.ussd_flows(id) ON DELETE CASCADE,
  step_order INTEGER,
  dialog_text TEXT NOT NULL,
  device_id TEXT,
  suggested_step_id UUID,
  matched BOOLEAN NOT NULL DEFAULT false,
  auto_learned BOOLEAN NOT NULL DEFAULT false,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ussd_unmatched_dialogs TO authenticated;
GRANT INSERT ON public.ussd_unmatched_dialogs TO anon;
GRANT ALL ON public.ussd_unmatched_dialogs TO service_role;

ALTER TABLE public.ussd_unmatched_dialogs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage unmatched dialogs" ON public.ussd_unmatched_dialogs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can log unmatched dialog" ON public.ussd_unmatched_dialogs
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_unmatched_created ON public.ussd_unmatched_dialogs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_unmatched_resolved ON public.ussd_unmatched_dialogs(resolved);

-- RPC: append a keyword to an existing step's match_keywords, dedup + lower
CREATE OR REPLACE FUNCTION public.learn_ussd_keyword(_step_id uuid, _kw text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean TEXT;
BEGIN
  clean := lower(trim(_kw));
  IF clean IS NULL OR clean = '' THEN
    RETURN;
  END IF;
  UPDATE public.ussd_flow_steps
  SET match_keywords = ARRAY(
    SELECT DISTINCT unnest(COALESCE(match_keywords, ARRAY[]::text[]) || ARRAY[clean])
  )
  WHERE id = _step_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.learn_ussd_keyword(uuid, text) TO anon, authenticated, service_role;

-- RPC: mark unmatched dialog resolved when auto-learned by service
CREATE OR REPLACE FUNCTION public.resolve_unmatched_dialog(_id uuid, _step_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.ussd_unmatched_dialogs
  SET matched = true, auto_learned = true, resolved = true, suggested_step_id = _step_id
  WHERE id = _id;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_unmatched_dialog(uuid, uuid) TO anon, authenticated, service_role;
