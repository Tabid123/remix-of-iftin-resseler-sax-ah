
-- 1. outreach_settings table
CREATE TABLE public.outreach_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_quota INTEGER NOT NULL DEFAULT 10,
  sms_template TEXT NOT NULL DEFAULT 'Salaan, Iftin Internet waxay haystaa pakeej cusub oo qiimo jaban. Booqo: https://iftininternet.com',
  cooldown_days INTEGER NOT NULL DEFAULT 30,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.outreach_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view outreach settings"
ON public.outreach_settings FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage outreach settings"
ON public.outreach_settings FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed default settings row
INSERT INTO public.outreach_settings (daily_quota, sms_template, cooldown_days)
VALUES (10, 'Salaan, Iftin Internet waxay haystaa pakeej cusub oo qiimo jaban. Booqo: https://iftininternet.com', 30);

-- 2. outreach_targets table
CREATE TABLE public.outreach_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  assigned_to UUID,
  assigned_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Africa/Mogadishu')::date,
  status TEXT NOT NULL DEFAULT 'pending',
  contact_method TEXT,
  notes TEXT,
  contacted_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(phone_number, assigned_date)
);

CREATE INDEX idx_outreach_targets_assigned_date ON public.outreach_targets(assigned_date);
CREATE INDEX idx_outreach_targets_status ON public.outreach_targets(status);
CREATE INDEX idx_outreach_targets_phone ON public.outreach_targets(phone_number);

ALTER TABLE public.outreach_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view outreach targets"
ON public.outreach_targets FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage outreach targets"
ON public.outreach_targets FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Updated_at trigger
CREATE TRIGGER trg_outreach_settings_updated_at
BEFORE UPDATE ON public.outreach_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_outreach_targets_updated_at
BEFORE UPDATE ON public.outreach_targets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. RPC: generate_daily_outreach_targets
CREATE OR REPLACE FUNCTION public.generate_daily_outreach_targets(p_admin_id UUID DEFAULT NULL)
RETURNS TABLE(inserted_count INTEGER, total_today INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quota INTEGER;
  v_cooldown INTEGER;
  v_today DATE := (now() AT TIME ZONE 'Africa/Mogadishu')::date;
  v_existing INTEGER;
  v_to_add INTEGER;
  v_inserted INTEGER := 0;
BEGIN
  -- Load settings
  SELECT daily_quota, cooldown_days INTO v_quota, v_cooldown
  FROM public.outreach_settings
  ORDER BY created_at DESC LIMIT 1;

  IF v_quota IS NULL THEN
    v_quota := 10;
    v_cooldown := 30;
  END IF;

  -- How many already assigned today
  SELECT COUNT(*)::int INTO v_existing
  FROM public.outreach_targets
  WHERE assigned_date = v_today;

  v_to_add := GREATEST(v_quota - v_existing, 0);

  IF v_to_add > 0 THEN
    WITH eligible AS (
      SELECT vp.phone_number, vp.created_at
      FROM public.verified_phones vp
      WHERE NOT EXISTS (
        SELECT 1 FROM public.orders o
        WHERE (o.customer_phone = vp.phone_number OR o.sender_phone = vp.phone_number)
          AND o.delivery_status = 'delivered'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.blocked_users bu
        WHERE bu.phone_number = vp.phone_number AND bu.is_active = true
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.outreach_targets ot
        WHERE ot.phone_number = vp.phone_number
          AND (
            ot.assigned_date = v_today
            OR (ot.status = 'not_interested' AND ot.assigned_date >= v_today - v_cooldown)
            OR (ot.status IN ('called','messaged','pending') AND ot.assigned_date >= v_today - 7)
          )
      )
      ORDER BY vp.created_at DESC
      LIMIT v_to_add
    )
    INSERT INTO public.outreach_targets (phone_number, assigned_to, assigned_date, status)
    SELECT phone_number, p_admin_id, v_today, 'pending'
    FROM eligible
    ON CONFLICT (phone_number, assigned_date) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT v_inserted, (v_existing + v_inserted);
END;
$$;

-- 4. Trigger function: auto-mark converted
CREATE OR REPLACE FUNCTION public.mark_outreach_converted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.delivery_status = 'delivered' AND (TG_OP = 'INSERT' OR OLD.delivery_status IS DISTINCT FROM 'delivered') THEN
    UPDATE public.outreach_targets
    SET status = 'converted',
        converted_at = now()
    WHERE phone_number IN (NEW.customer_phone, NEW.sender_phone)
      AND assigned_date >= (now() AT TIME ZONE 'Africa/Mogadishu')::date - 30
      AND status NOT IN ('converted');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_orders_mark_outreach_converted
AFTER INSERT OR UPDATE OF delivery_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.mark_outreach_converted();
