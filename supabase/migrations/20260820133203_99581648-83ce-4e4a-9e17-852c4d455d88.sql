-- Recreate get_most_purchased_packages with correct GROUP BY for view columns
DROP FUNCTION IF EXISTS public.get_most_purchased_packages(uuid);

CREATE OR REPLACE FUNCTION public.get_most_purchased_packages(p_tenant_id uuid DEFAULT NULL::uuid)
RETURNS SETOF public.customer_data_packages
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    p.id,
    p.provider_id,
    p.category_id,
    p.package_name,
    p.data_amount,
    p.validity_days,
    p.selling_price,
    p.is_active,
    p.connection_type_label,
    p.ussd_code,
    p.ussd_method,
    p.created_at,
    p.updated_at,
    p.tenant_id
  FROM public.customer_data_packages p
  LEFT JOIN public.orders o ON o.package_id = p.id AND o.delivery_status <> 'cancelled'
  GROUP BY
    p.id,
    p.provider_id,
    p.category_id,
    p.package_name,
    p.data_amount,
    p.validity_days,
    p.selling_price,
    p.is_active,
    p.connection_type_label,
    p.ussd_code,
    p.ussd_method,
    p.created_at,
    p.updated_at,
    p.tenant_id
  ORDER BY COUNT(o.id) DESC
  LIMIT 12;
$$;