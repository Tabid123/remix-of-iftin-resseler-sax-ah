
CREATE OR REPLACE FUNCTION public.get_active_providers()
RETURNS SETOF public.providers_config
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.providers_config WHERE is_active = true ORDER BY display_order, provider_name;
$$;

CREATE OR REPLACE FUNCTION public.get_active_categories(provider_uuid uuid DEFAULT NULL)
RETURNS SETOF public.package_categories
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.package_categories
  WHERE is_active = true AND (provider_uuid IS NULL OR provider_id = provider_uuid)
  ORDER BY display_order, category_name;
$$;

CREATE OR REPLACE FUNCTION public.get_active_payment_providers()
RETURNS SETOF public.payment_providers_config
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.payment_providers_config WHERE is_active = true ORDER BY provider_name;
$$;

CREATE OR REPLACE FUNCTION public.get_public_packages(provider_uuid uuid)
RETURNS SETOF public.data_packages_config
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.data_packages_config
  WHERE is_active = true AND provider_id = provider_uuid
  ORDER BY selling_price;
$$;

CREATE OR REPLACE FUNCTION public.get_featured_packages()
RETURNS SETOF public.data_packages_config
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.* FROM public.data_packages_config p
  JOIN public.featured_packages f ON f.package_id = p.id
  WHERE f.is_active = true AND p.is_active = true
  ORDER BY f.display_order;
$$;

CREATE OR REPLACE FUNCTION public.get_most_purchased_packages()
RETURNS SETOF public.data_packages_config
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.* FROM public.data_packages_config p
  LEFT JOIN public.orders o ON o.package_id = p.id AND o.delivery_status <> 'cancelled'
  WHERE p.is_active = true
  GROUP BY p.id
  ORDER BY COUNT(o.id) DESC
  LIMIT 12;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_analytics_summary()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total_orders', (SELECT COUNT(*) FROM public.orders WHERE delivery_status <> 'cancelled'),
    'total_revenue', COALESCE((SELECT SUM(selling_price) FROM public.orders WHERE delivery_status <> 'cancelled'), 0),
    'total_profit', 0,
    'pending_orders', (SELECT COUNT(*) FROM public.orders WHERE status = 'pending'),
    'completed_orders', (SELECT COUNT(*) FROM public.orders WHERE delivery_status = 'completed')
  );
$$;

CREATE OR REPLACE FUNCTION public.get_admin_provider_daily_stats(p_date date DEFAULT (now() AT TIME ZONE 'Africa/Mogadishu')::date)
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH agg AS (
    SELECT pr.id AS provider_id, pr.provider_name, pr.evoucher_rate,
           COUNT(o.id) AS order_count,
           COALESCE(SUM(o.selling_price), 0) AS revenue
    FROM public.providers_config pr
    LEFT JOIN public.orders o
      ON o.provider_id = pr.id
     AND o.delivery_status <> 'cancelled'
     AND (o.created_at AT TIME ZONE 'Africa/Mogadishu')::date = p_date
    WHERE pr.is_active = true
    GROUP BY pr.id, pr.provider_name, pr.evoucher_rate
  )
  SELECT to_jsonb(agg.*) FROM agg ORDER BY agg.provider_name;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_date_range_breakdown(p_start_date timestamptz, p_end_date timestamptz, p_provider_id uuid DEFAULT NULL)
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH agg AS (
    SELECT (o.created_at AT TIME ZONE 'Africa/Mogadishu')::date AS date,
           o.provider_id,
           COUNT(o.id) AS order_count,
           COALESCE(SUM(o.selling_price), 0) AS revenue
    FROM public.orders o
    WHERE o.delivery_status <> 'cancelled'
      AND o.created_at >= p_start_date AND o.created_at <= p_end_date
      AND (p_provider_id IS NULL OR o.provider_id = p_provider_id)
    GROUP BY 1, 2
  )
  SELECT to_jsonb(agg.*) FROM agg ORDER BY agg.date;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_transactions_summary(p_provider_id uuid DEFAULT NULL, p_period text DEFAULT 'all')
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'total', COALESCE(SUM(selling_price), 0)
  )
  FROM public.orders
  WHERE delivery_status <> 'cancelled'
    AND (p_provider_id IS NULL OR provider_id = p_provider_id);
$$;

CREATE OR REPLACE FUNCTION public.get_admin_transactions_paginated(
  p_search text DEFAULT NULL, p_status text DEFAULT NULL, p_provider_id uuid DEFAULT NULL,
  p_period text DEFAULT 'all', p_limit int DEFAULT 50, p_offset int DEFAULT 0
)
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(o.*)
  FROM public.orders o
  WHERE o.delivery_status <> 'cancelled'
    AND (p_provider_id IS NULL OR o.provider_id = p_provider_id)
    AND (p_status IS NULL OR p_status = 'all' OR o.status = p_status)
    AND (p_search IS NULL OR o.customer_phone ILIKE '%'||p_search||'%' OR o.receiver_phone ILIKE '%'||p_search||'%')
  ORDER BY o.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

CREATE OR REPLACE FUNCTION public.generate_daily_outreach_targets(p_admin_id uuid DEFAULT NULL)
RETURNS TABLE(inserted_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT 0::integer;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_outreach_follow_ups()
RETURNS SETOF public.outreach_targets
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.outreach_targets
  WHERE follow_up_due_at IS NOT NULL AND follow_up_due_at <= now()
  ORDER BY follow_up_due_at;
$$;

CREATE OR REPLACE FUNCTION public.bump_outreach_follow_up(p_target_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.outreach_targets
  SET follow_up_count = follow_up_count + 1,
      last_follow_up_at = now(),
      follow_up_due_at = now() + interval '10 days'
  WHERE id = p_target_id;
$$;

CREATE OR REPLACE FUNCTION public.auto_recover_stuck_deliveries()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE recovered int := 0;
BEGIN
  UPDATE public.delivery_queue
  SET status = 'pending', last_attempt_at = NULL
  WHERE status = 'processing' AND last_attempt_at < now() - interval '5 minutes';
  GET DIAGNOSTICS recovered = ROW_COUNT;
  RETURN jsonb_build_object('recovered', recovered);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_online_payment_reservation(
  p_verified_phone text, p_sender_phone text, p_receiver_phone text,
  p_provider_id uuid, p_package_id uuid, p_payment_provider text, p_expected_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_id uuid;
BEGIN
  INSERT INTO public.pending_online_payments (
    verified_phone, sender_phone, receiver_phone,
    provider_id, package_id, payment_provider, expected_amount
  ) VALUES (
    p_verified_phone, p_sender_phone, p_receiver_phone,
    p_provider_id, p_package_id, p_payment_provider, p_expected_amount
  )
  RETURNING id INTO new_id;
  RETURN jsonb_build_object('ok', true, 'intent_id', new_id);
END;
$$;
