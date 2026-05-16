-- Hagaajinta dalabaadka pending si USSD-ka loo diyaariyo (placeholders la beddelay)
UPDATE public.delivery_queue
SET ussd_code = '*726*619535029*050*5516#',
    status = 'pending',
    last_attempt_at = NULL
WHERE id IN ('2028cce0-480d-4b62-8750-5cf319f47654','f4785564-9626-4ac9-ac75-37c88980551d');