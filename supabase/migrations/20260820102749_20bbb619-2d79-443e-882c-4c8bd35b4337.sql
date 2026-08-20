-- Helper: is the current user a manager (owner/admin) of the tenant?
CREATE OR REPLACE FUNCTION public.is_tenant_manager(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _tenant_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE user_id = auth.uid()
      AND tenant_id = _tenant_id
      AND COALESCE(member_role, role) IN ('owner','admin','manager')
  );
$$;

-- Tenant-scoped CRUD for reseller-managed tables + auto tenant_id on insert
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'banners_config','payment_providers_config','provider_wholesale_tiers',
    'android_devices','delivery_queue','payment_receipts','notifications',
    'data_packages_config','package_categories','delivery_instructions',
    'providers_config','app_settings','blocked_users','bulk_sms_campaigns','bulk_sms_queue'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "tenant managers manage %1$s" ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY "tenant managers manage %1$s" ON public.%1$I FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()) OR public.is_tenant_manager(tenant_id)) WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_tenant_manager(tenant_id))',
      t
    );
    EXECUTE format('DROP TRIGGER IF EXISTS set_tenant_id_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER set_tenant_id_%1$s BEFORE INSERT ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_default()', t);
  END LOOP;
END $$;

-- Orders: tenant managers can create/delete their own tenant's orders too
DROP POLICY IF EXISTS "tenant managers insert orders" ON public.orders;
CREATE POLICY "tenant managers insert orders" ON public.orders
FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_tenant_manager(tenant_id));

DROP TRIGGER IF EXISTS set_tenant_id_orders ON public.orders;
CREATE TRIGGER set_tenant_id_orders BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_default();