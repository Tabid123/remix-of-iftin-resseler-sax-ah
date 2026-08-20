create or replace function public.__rls_probe(_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare res jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', _uid::text, 'role','authenticated')::text, true);
  set local role authenticated;
  select jsonb_build_object(
    'uid', auth.uid(),
    'tenants', (select coalesce(jsonb_agg(jsonb_build_object('slug', t.slug)), '[]'::jsonb) from public.tenants t),
    'tenant_members', (select count(*) from public.tenant_members),
    'orders', (select count(*) from public.orders),
    'devices', (select count(*) from public.android_devices),
    'audit_logs', (select count(*) from public.audit_logs)
  ) into res;
  reset role;
  return res;
end;
$$;
revoke all on function public.__rls_probe(uuid) from public, anon, authenticated;