insert into public.tenants (slug, name, status, plan, owner_id, primary_color, secondary_color)
values ('rls-test-b', 'RLS Test Workspace B', 'active', 'free', '8258bc2d-f22c-456c-a070-808a74c84b6d', '#123456', '#ffffff')
on conflict (slug) do nothing;

insert into public.tenant_members (tenant_id, user_id, role, member_role)
select t.id, '8258bc2d-f22c-456c-a070-808a74c84b6d', 'owner', 'owner'
from public.tenants t where t.slug = 'rls-test-b'
on conflict (tenant_id, user_id) do nothing;