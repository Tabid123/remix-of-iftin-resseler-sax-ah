drop policy if exists "Public can view active tenants" on public.tenants;
revoke select on public.tenants from anon;
drop function if exists public.__rls_probe(uuid);