DROP POLICY IF EXISTS "public read categories" ON public.package_categories;
CREATE POLICY "public read categories"
ON public.package_categories
FOR SELECT
TO anon
USING (tenant_id = public.resolve_public_tenant());