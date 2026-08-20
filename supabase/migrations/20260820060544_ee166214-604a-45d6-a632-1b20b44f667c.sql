
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS secondary_color text DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS owner_id uuid;

ALTER TABLE public.tenants ALTER COLUMN primary_color SET DEFAULT '#000000';
UPDATE public.tenants SET secondary_color = COALESCE(secondary_color, '#ffffff'),
                          primary_color = COALESCE(primary_color, '#000000');

ALTER TABLE public.tenant_members ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member';
UPDATE public.tenant_members SET role = member_role WHERE role IS DISTINCT FROM member_role;

CREATE OR REPLACE FUNCTION public.sync_tenant_member_role()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role IS NULL OR NEW.role = 'member' THEN NEW.role := COALESCE(NEW.member_role, 'member'); END IF;
    IF NEW.member_role IS NULL THEN NEW.member_role := NEW.role; END IF;
  ELSE
    IF NEW.role IS DISTINCT FROM OLD.role THEN NEW.member_role := NEW.role;
    ELSIF NEW.member_role IS DISTINCT FROM OLD.member_role THEN NEW.role := NEW.member_role; END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_tenant_member_role ON public.tenant_members;
CREATE TRIGGER trg_sync_tenant_member_role
BEFORE INSERT OR UPDATE ON public.tenant_members
FOR EACH ROW EXECUTE FUNCTION public.sync_tenant_member_role();

UPDATE public.tenants t
SET owner_id = m.user_id
FROM (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id
  FROM public.tenant_members WHERE member_role = 'owner' ORDER BY tenant_id, created_at
) m
WHERE m.tenant_id = t.id AND t.owner_id IS NULL;

CREATE OR REPLACE FUNCTION public.get_user_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.get_user_tenant_ids() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_slug text;
  v_name text;
  v_tenant uuid;
BEGIN
  IF COALESCE(NEW.raw_user_meta_data->>'skip_auto_tenant', 'false') = 'true' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_members WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_slug := 'company-' || substr(replace(NEW.id::text, '-', ''), 1, 8);
  WHILE EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_slug) LOOP
    v_slug := 'company-' || substr(md5(random()::text), 1, 8);
  END LOOP;
  v_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'company_name', ''),
                     'Company-' || upper(substr(replace(v_slug, 'company-', ''), 1, 6)));

  INSERT INTO public.tenants (slug, name, owner_id, plan, status, primary_color, secondary_color)
  VALUES (v_slug, v_name, NEW.id, 'free', 'active', '#000000', '#ffffff')
  RETURNING id INTO v_tenant;

  INSERT INTO public.tenant_members (tenant_id, user_id, member_role, role)
  VALUES (v_tenant, NEW.id, 'owner', 'owner')
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created_tenant ON auth.users;
CREATE TRIGGER on_auth_user_created_tenant
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_tenant();

DROP POLICY IF EXISTS "Members view their tenants" ON public.tenants;
CREATE POLICY "Members view their tenants" ON public.tenants
FOR SELECT TO authenticated
USING (id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS "Members view tenant members" ON public.tenant_members;
CREATE POLICY "Members view tenant members" ON public.tenant_members
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS "Members read their tenant logo" ON storage.objects;
CREATE POLICY "Members read their tenant logo" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'tenant-logos' AND ((storage.foldername(name))[1])::uuid IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS "Members upload their tenant logo" ON storage.objects;
CREATE POLICY "Members upload their tenant logo" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'tenant-logos' AND ((storage.foldername(name))[1])::uuid IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS "Members update their tenant logo" ON storage.objects;
CREATE POLICY "Members update their tenant logo" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'tenant-logos' AND ((storage.foldername(name))[1])::uuid IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS "Members delete their tenant logo" ON storage.objects;
CREATE POLICY "Members delete their tenant logo" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'tenant-logos' AND ((storage.foldername(name))[1])::uuid IN (SELECT public.get_user_tenant_ids()));
