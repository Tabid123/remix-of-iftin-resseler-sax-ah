
CREATE TABLE public.provider_wholesale_tiers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id uuid NOT NULL,
  tier_name text NOT NULL DEFAULT 'Jumlo',
  min_amount numeric NOT NULL,
  max_amount numeric NOT NULL,
  profit_rate numeric NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_wholesale_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read wholesale tiers"
ON public.provider_wholesale_tiers FOR SELECT
USING (true);

CREATE POLICY "admin all wholesale tiers"
ON public.provider_wholesale_tiers FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_wholesale_tiers_updated_at
BEFORE UPDATE ON public.provider_wholesale_tiers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_wholesale_tiers_provider ON public.provider_wholesale_tiers(provider_id, is_active);

CREATE OR REPLACE FUNCTION public.get_provider_wholesale_tiers(provider_uuid uuid)
RETURNS SETOF public.provider_wholesale_tiers
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.provider_wholesale_tiers
  WHERE is_active = true AND provider_id = provider_uuid
  ORDER BY display_order, min_amount;
$$;
