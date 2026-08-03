CREATE OR REPLACE FUNCTION public.force_delete_provider(p_provider_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pkg_ids uuid[];
  v_order_ids uuid[];
  v_flow_ids uuid[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  SELECT array_agg(id) INTO v_pkg_ids FROM public.data_packages_config WHERE provider_id = p_provider_id;
  v_pkg_ids := COALESCE(v_pkg_ids, ARRAY[]::uuid[]);

  SELECT array_agg(id) INTO v_order_ids FROM public.orders
   WHERE provider_id = p_provider_id OR package_id = ANY(v_pkg_ids);
  v_order_ids := COALESCE(v_order_ids, ARRAY[]::uuid[]);

  SELECT array_agg(id) INTO v_flow_ids FROM public.ussd_flows WHERE provider_id = p_provider_id;
  v_flow_ids := COALESCE(v_flow_ids, ARRAY[]::uuid[]);

  -- order dependents
  DELETE FROM public.delivery_queue WHERE order_id = ANY(v_order_ids);
  UPDATE public.payment_receipts SET matched_order_id = NULL WHERE matched_order_id = ANY(v_order_ids);
  DELETE FROM public.orders WHERE id = ANY(v_order_ids);

  -- package dependents
  DELETE FROM public.featured_packages WHERE package_id = ANY(v_pkg_ids);
  DELETE FROM public.package_delivery_rules WHERE source_package_id = ANY(v_pkg_ids) OR target_package_id = ANY(v_pkg_ids);
  DELETE FROM public.package_profit_overrides WHERE package_id = ANY(v_pkg_ids);
  DELETE FROM public.customer_discounts WHERE package_id = ANY(v_pkg_ids) OR provider_id = p_provider_id;
  DELETE FROM public.discount_codes WHERE package_id = ANY(v_pkg_ids) OR provider_id = p_provider_id;
  DELETE FROM public.delivery_instructions WHERE package_id = ANY(v_pkg_ids) OR provider_id = p_provider_id;
  DELETE FROM public.pending_online_payments WHERE package_id = ANY(v_pkg_ids) OR provider_id = p_provider_id;
  DELETE FROM public.data_packages_config WHERE id = ANY(v_pkg_ids);

  -- provider dependents
  DELETE FROM public.package_categories WHERE provider_id = p_provider_id;
  DELETE FROM public.offline_registrations WHERE provider_id = p_provider_id;
  DELETE FROM public.provider_wholesale_tiers WHERE provider_id = p_provider_id;

  -- ussd flows
  UPDATE public.providers_config SET ussd_flow_id = NULL WHERE id = p_provider_id;
  DELETE FROM public.ussd_unmatched_dialogs WHERE flow_id = ANY(v_flow_ids);
  DELETE FROM public.ussd_flow_steps WHERE flow_id = ANY(v_flow_ids);
  DELETE FROM public.ussd_flows WHERE id = ANY(v_flow_ids);

  DELETE FROM public.providers_config WHERE id = p_provider_id;

  RETURN jsonb_build_object('ok', true, 'deleted_orders', array_length(v_order_ids, 1), 'deleted_packages', array_length(v_pkg_ids, 1));
END;
$$;

GRANT EXECUTE ON FUNCTION public.force_delete_provider(uuid) TO authenticated;