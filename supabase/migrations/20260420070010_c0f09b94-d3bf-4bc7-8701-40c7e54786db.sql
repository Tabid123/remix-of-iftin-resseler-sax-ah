-- Add follow_up tracking columns to outreach_targets
ALTER TABLE public.outreach_targets
  ADD COLUMN IF NOT EXISTS follow_up_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_follow_up_at timestamptz;

-- Add follow_up_days to settings
ALTER TABLE public.outreach_settings
  ADD COLUMN IF NOT EXISTS follow_up_days integer NOT NULL DEFAULT 10;

-- When admin marks called/messaged → set follow_up_due_at = contacted_at + N days
CREATE OR REPLACE FUNCTION public.set_outreach_follow_up_due()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer;
BEGIN
  IF NEW.status IN ('called', 'messaged')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.contacted_at IS DISTINCT FROM NEW.contacted_at)
     AND NEW.contacted_at IS NOT NULL
  THEN
    SELECT follow_up_days INTO v_days FROM public.outreach_settings ORDER BY created_at DESC LIMIT 1;
    IF v_days IS NULL THEN v_days := 10; END IF;
    NEW.follow_up_due_at := NEW.contacted_at + (v_days || ' days')::interval;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_outreach_follow_up_due ON public.outreach_targets;
CREATE TRIGGER trg_set_outreach_follow_up_due
BEFORE INSERT OR UPDATE ON public.outreach_targets
FOR EACH ROW EXECUTE FUNCTION public.set_outreach_follow_up_due();

-- RPC: Get pending follow-ups (called/messaged, due, not converted)
CREATE OR REPLACE FUNCTION public.get_outreach_follow_ups()
RETURNS TABLE(
  id uuid,
  phone_number text,
  status text,
  contact_method text,
  notes text,
  contacted_at timestamptz,
  follow_up_due_at timestamptz,
  follow_up_count integer,
  last_follow_up_at timestamptz,
  assigned_date date,
  days_overdue integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id, t.phone_number, t.status, t.contact_method, t.notes,
    t.contacted_at, t.follow_up_due_at, t.follow_up_count, t.last_follow_up_at,
    t.assigned_date,
    GREATEST(0, EXTRACT(DAY FROM (now() - t.follow_up_due_at))::integer) AS days_overdue
  FROM public.outreach_targets t
  WHERE t.status IN ('called','messaged')
    AND t.follow_up_due_at IS NOT NULL
    AND t.follow_up_due_at <= now()
    AND NOT EXISTS (
      SELECT 1 FROM public.orders o
      WHERE (o.customer_phone = t.phone_number OR o.sender_phone = t.phone_number)
        AND o.delivery_status = 'delivered'
        AND o.created_at >= t.contacted_at
    )
  ORDER BY t.follow_up_due_at ASC;
$$;

-- RPC: increment follow-up counter when admin re-contacts
CREATE OR REPLACE FUNCTION public.bump_outreach_follow_up(p_target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer;
BEGIN
  SELECT follow_up_days INTO v_days FROM public.outreach_settings ORDER BY created_at DESC LIMIT 1;
  IF v_days IS NULL THEN v_days := 10; END IF;
  UPDATE public.outreach_targets
  SET follow_up_count = follow_up_count + 1,
      last_follow_up_at = now(),
      follow_up_due_at = now() + (v_days || ' days')::interval,
      contacted_at = now()
  WHERE id = p_target_id;
END;
$$;