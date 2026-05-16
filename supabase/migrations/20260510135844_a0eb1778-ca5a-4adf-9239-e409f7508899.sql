UPDATE public.android_devices
SET sim1_provider = 'Hormuud',
    provider_name = 'Hormuud'
WHERE device_id = 'a99c83497b3b5683'
  AND (sim1_provider IS NULL OR sim1_provider = '');