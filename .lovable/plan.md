## Hadafka
Mashruuca ka dhig **SaaS multi-tenant**: reseller kasta wuxuu leeyahay account, device/SIM kiisa, iyo rate/tiers uu isagu u sameysto shirkad kasta. Shirkadaha waa 4 oo hard-code ah: **Hormuud, Somtel, Somnet, Amtel**. Dalab kasta wuu automatic noqonayaa (USSD flow + PIN + delivery).

## Qaab-dhismeedka cusub

### 1. Tenants (reseller businesses)
Table cusub `tenants` (id, name, slug, owner_user_id, is_active, created_at).
Table cusub `tenant_members` (tenant_id, user_id, role: owner/staff).
Function `current_tenant_id()` — security definer, waxay ka soo celisaa tenant-ka user-ka hadda.

### 2. `tenant_id` lagu darayo table walba
Kuwa la beddelayo: `orders`, `delivery_queue`, `payment_receipts`, `pending_online_payments`, `android_devices`, `devices`, `sim_balances`, `provider_wholesale_tiers`, `data_packages_config`, `package_categories`, `delivery_instructions`, `offline_registrations`, `customer_discounts`, `discount_codes`, `auto_topup_numbers`, `blocked_users`, `bulk_sms_campaigns`, `verified_phones`.

Xogta hadda jirta oo dhan waxaa loo qoondaynayaa hal tenant ("Iftin") si aan waxba u lumin.

### 3. RLS oo dhan la beddelayo
Policy walba wuxuu noqonayaa: `tenant_id = current_tenant_id()` (ama `has_role(auth.uid(),'admin')` platform-admin ahaan).
Edge functions (service_role) sida hadda ayay u shaqaynayaan, laakiin `tenant_id` way qori doonaan.

### 4. Shirkadaha 4-da hard-code
`src/config/carriers.ts` — hal fayl:
```ts
export const CARRIERS = [
  { key:'hormuud', name:'Hormuud', logo, trigger:'*712*', prefixes:['61','77'] },
  { key:'somtel',  name:'Somtel',  logo, trigger:'*300#', prefixes:['62','65'] },
  { key:'somnet',  name:'Somnet',  logo, trigger:'*825#', prefixes:['68'] },
  { key:'amtel',   name:'Amtel',   logo, trigger:'*825#', prefixes:['71'] },
];
```
USSD flow steps-ka 4-da waxay ku jiraan `BUILTIN_FLOWS` gudaha `UssdFlowsClient.kt` (Somtel + Somnet horey ayaa loo dhigay; Hormuud + Amtel waa la dhammeystirayaa).
`providers_config` wuxuu noqonayaa **global/shared** (lama beddelo reseller kasta) — reseller-ku wuxuu keliya beddelaa rate-yadiisa.

### 5. Rate iyo Tiers reseller kasta
`provider_wholesale_tiers` + `tenant_id` → reseller kasta wuxuu leeyahay tiers kiisa shirkad kasta.
Table cusub `tenant_provider_rates` (tenant_id, provider_key, evoucher_rate) — rate default-ka shirkad kasta.
Admin tab cusub **"Rates & Tiers"**: 4 card (shirkad kasta) → rate default + liis tiers ah oo la abuuri/beddeli karo.

Xisaabta topup: `topup = amount * (1 + tier.profit_rate/100)` haddii tier la helo, haddii kale `amount * (1 + tenant_rate)`.

### 6. Dalab automatic 100%
`process-payment-receipt` wuxuu:
1. Ka helayaa `tenant_id` SIM-ka receiver-ka (`android_devices.sim_number` → tenant).
2. Ku xisaabinayaa rate/tier tenant-kaas.
3. Toos ugu darayaa `delivery_queue` (status pending) — approve gacan lama rabo.
Android-ka realtime ayuu ku qaadanayaa (horey loo dhigay).

### 7. Onboarding reseller
Route cusub `/signup` → email/password → `tenants` row + `tenant_members(owner)` + 4 rate default.
Onboarding wizard: (1) magaca ganacsiga (2) rate shirkad kasta (3) device pairing code.

## Faylasha
**Cusub:** `src/config/carriers.ts`, `src/pages/Signup.tsx`, `src/pages/Onboarding.tsx`, `src/contexts/TenantContext.tsx`, `src/components/admin/RatesAndTiersManager.tsx`
**Migration:** `tenants`, `tenant_members`, `tenant_provider_rates`, `tenant_id` + backfill + RLS dib-u-qoris, `current_tenant_id()`
**Beddel:** `AdminSidebar.tsx`, `AdminDashboard.tsx`, `ProviderSelection.tsx`, `WholesaleTiersManager.tsx`, edge functions (`process-payment-receipt`, `register-device`, `activate-package`), `UssdFlowsClient.kt`

## Habka aan u socono (maanta)
Sababtoo ah tani waa isbeddel weyn oo database-ka oo dhan taabanaya, waxaan u qaybinayaa 3 qaybood oo isku xigxiga — mid kasta waa la tijaabin karaa ka hor inta aan tan xigta la bilaabin:

1. **Qeyb 1 (maanta):** Migration tenants + tenant_id + RLS + backfill, `TenantContext`, signup/onboarding.
2. **Qeyb 2:** `carriers.ts` hard-code + `RatesAndTiersManager` (rate & tiers reseller kasta).
3. **Qeyb 3:** Edge functions + Android tenant-aware, dalab automatic 100%.

## Digniin
Xogta hadda jirta (orders, devices, flows) **lama tirtirayo** — waxaa lagu wareejinayaa tenant-ka koowaad ee "Iftin".
