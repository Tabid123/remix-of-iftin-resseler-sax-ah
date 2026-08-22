INSERT INTO public.tenant_members (tenant_id, user_id, member_role, role)
SELECT c.tenant_id, c.user_id, 'owner', 'owner'
FROM public.tenant_admin_credentials c
WHERE c.user_id IS NOT NULL
ON CONFLICT (tenant_id, user_id) DO UPDATE SET member_role = 'owner', role = 'owner';

UPDATE public.tenants t
SET owner_id = c.user_id
FROM public.tenant_admin_credentials c
WHERE c.tenant_id = t.id AND t.owner_id IS NULL AND c.user_id IS NOT NULL;