# Tenant startup, reseller login, and branding fix

## Goal
Make every reseller storefront and dashboard resolve its own tenant before rendering, keep reseller admins isolated to their assigned tenant, and use that tenant's primary color consistently across customer pages.

## Changes
1. **Tenant-first startup**
   - Resolve `?t=<slug>` before showing storefront UI and expose a real tenant-loading state.
   - Scope cached providers, rates, banners, and queries by tenant ID so Iftin/default cached data cannot flash on another tenant.
   - Keep the tenant slug through customer navigation and prevent stale local tenant data from overriding an explicit URL slug.

2. **Reseller admin authentication and isolation**
   - After password login, validate the authenticated user and fetch only their tenant-manager memberships.
   - Route platform super admins to `/admin`, but route tenant owners/admins/managers to `/reseller` with their assigned tenant selected.
   - Remove the global-admin ambiguity that can mix platform admins with reseller admins, and make the reseller guard reject users without an active manager membership.
   - Ensure the reseller dashboard waits for the authenticated tenant before rendering data.

3. **Tenant branding consistency**
   - Promote the resolved tenant primary color into the app's semantic primary tokens.
   - Replace hardcoded blue/purple customer and reseller page headers with tenant-aware header styling.
   - Apply the tenant color to the bottom navigation and key page headers while preserving provider-specific colors only for provider cards.

4. **Verification**
   - Test a direct tenant URL from a clean browser and confirm no Iftin/default flash appears.
   - Test reseller sign-in and confirm it opens only the reseller's tenant dashboard.
   - Navigate through providers, order history, notifications, and profile to confirm header colors remain tenant-branded.

## Technical notes
- No new profile table is needed; existing `tenant_members`, `tenants`, and `user_roles` remain the source of authorization.
- Query keys and offline caches will include tenant identity to prevent cross-tenant cache leakage.
- Database changes will be limited to RLS/function corrections only if runtime inspection proves current policies cannot enforce the existing tenant membership model.
