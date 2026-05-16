-- Clean existing queued PIN values and keep future delivery_queue PINs numeric-only.
UPDATE public.delivery_queue
SET pin_code = NULLIF(regexp_replace(TRIM(pin_code), '[^0-9]', '', 'g'), '')
WHERE pin_code IS NOT NULL
  AND pin_code IS DISTINCT FROM NULLIF(regexp_replace(TRIM(pin_code), '[^0-9]', '', 'g'), '');

CREATE OR REPLACE FUNCTION public.normalize_delivery_queue_pin_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.pin_code IS NOT NULL THEN
    NEW.pin_code := NULLIF(regexp_replace(TRIM(NEW.pin_code), '[^0-9]', '', 'g'), '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_delivery_queue_pin_code_trigger ON public.delivery_queue;
CREATE TRIGGER normalize_delivery_queue_pin_code_trigger
BEFORE INSERT OR UPDATE OF pin_code ON public.delivery_queue
FOR EACH ROW
EXECUTE FUNCTION public.normalize_delivery_queue_pin_code();