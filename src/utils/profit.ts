/**
 * Shared profit calculation for orders.
 *
 * Two paths:
 *  - JUMLO orders → use the wholesale tier's `profit_rate` (each provider has different tiers).
 *      profit = selling_price * (tier.profit_rate / 100)
 *      (equivalent to topup_amount - selling_price when topup_amount is stored)
 *  - Normal data packages → provider-level evoucher_rate formula.
 *      profit = (selling_price * (1 + evoucher_rate)) - cost_price
 *
 * Detection: package_name starts with "Jumlo" OR a joined intent with intent_type='jumlo'.
 */

export type OrderForProfit = {
  selling_price?: number | null;
  package_name?: string | null;
  // Optional joined data — any of these shapes works:
  data_packages_config?: { cost_price?: number | null } | null;
  providers_config?: { evoucher_rate?: number | null } | null;
  intent?: {
    intent_type?: string | null;
    topup_amount?: number | null;
    tier?: { profit_rate?: number | null } | null;
    provider_wholesale_tiers?: { profit_rate?: number | null } | null;
  } | null;
  // Pre-resolved overrides (when caller already looked things up):
  __cost_price?: number | null;
  __evoucher_rate?: number | null;
  __tier_profit_rate?: number | null;
  __topup_amount?: number | null;
};

export function isJumloOrder(order: OrderForProfit): boolean {
  if (order?.intent?.intent_type === 'jumlo') return true;
  const name = (order?.package_name || '').trim().toLowerCase();
  return name.startsWith('jumlo');
}

export function calculateOrderProfit(order: OrderForProfit): number {
  const sellingPrice = Number(order?.selling_price || 0);
  if (!sellingPrice) return 0;

  if (isJumloOrder(order)) {
    // Always use the wholesale tier's own profit_rate per provider.
    const tierRate = Number(
      order.__tier_profit_rate ??
        order?.intent?.tier?.profit_rate ??
        order?.intent?.provider_wholesale_tiers?.profit_rate ??
        0
    );
    return sellingPrice * (tierRate / 100);
  }

  // Normal package
  const costPrice = Number(
    order.__cost_price ?? order?.data_packages_config?.cost_price ?? 0
  );
  const evoucherRate = Number(
    order.__evoucher_rate ?? order?.providers_config?.evoucher_rate ?? 0
  );
  return sellingPrice * (1 + evoucherRate) - costPrice;
}

/**
 * Convenience: build the profit using already-resolved primitive values.
 * Useful for code paths that already fetched the rates separately.
 */
export function calculateProfitPrimitives(args: {
  sellingPrice: number;
  isJumlo: boolean;
  // Jumlo:
  tierProfitRate?: number; // percent, e.g. 16 means 16%
  topupAmount?: number;
  // Normal:
  costPrice?: number;
  evoucherRate?: number; // decimal, e.g. 0.16 means 16%
}): number {
  if (!args.sellingPrice) return 0;
  if (args.isJumlo) {
    return args.sellingPrice * ((args.tierProfitRate || 0) / 100);
  }
  return (
    args.sellingPrice * (1 + (args.evoucherRate || 0)) - (args.costPrice || 0)
  );
}
