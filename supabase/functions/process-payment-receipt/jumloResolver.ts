// Pure helper that resolves the USSD code to dispatch for a Jumlo (wholesale) order.
// Handles BOTH provider USSD methods:
//   - multi_step  → returns the flow's trigger_code (Android executes ussd_flow_steps)
//   - single_step → expands ussd_single_template with all known placeholders
// Returns null on `ussd_code` when nothing is resolvable; caller should mark the order failed.

export type ProviderRow = {
  provider_name: string | null;
  ussd_method: 'single_step' | 'multi_step' | string | null;
  ussd_flow_id: string | null;
  ussd_single_template: string | null;
};

export type FlowRow = { trigger_code: string; is_enabled: boolean } | null;

export type JumloDispatch = {
  ussd_code: string | null;
  delivery_status: 'queued' | 'failed';
  delivery_notes: string | null;
};

// Format USSD amount: integers as-is, decimals use '*' between dollars and cents.
// e.g. 5 → "5", 5.50 → "5*50", 0.58 → "0*58"
function formatAmountForUssd(amt: number): string {
  if (Number.isInteger(amt)) return amt.toString();
  const f = Number(amt).toFixed(2);
  return f.replace('.', '*');
}

function normalizeReceiver(phone: string): string {
  let p = (phone || '').replace(/^\+/, '').replace(/\D/g, '');
  if (p.startsWith('252')) p = p.substring(3);
  return p.slice(-9);
}

export function expandSingleTemplate(
  template: string,
  amount: number,
  receiver: string,
  pin = '5516',
): string {
  const amt = formatAmountForUssd(amount);
  const rcv = normalizeReceiver(receiver);
  let out = template
    .replaceAll('{amount}', amt)
    .replaceAll('{cost_price}', amt)
    .replaceAll('{topup_amount}', amt)
    .replaceAll('{receiver}', rcv)
    .replaceAll('{phone}', rcv)
    .replaceAll('{receiver_phone}', rcv)
    .replaceAll('{number}', rcv)
    .replaceAll('{sim_password}', pin)
    .replaceAll('{pin}', pin);
  // Collapse extra asterisks and clean trailing
  out = out.replace(/\*+/g, '*').replace(/\*#/g, '#');
  return out;
}

export function resolveJumloDispatch(
  provider: ProviderRow | null,
  flow: FlowRow,
  topupAmount: number,
  receiverPhone: string,
  pin = '5516',
): JumloDispatch {
  const method = (provider?.ussd_method || '').toLowerCase();

  // Multi-step / interactive: Android device executes the named flow steps.
  if (method === 'multi_step' || method === 'interactive' || (!method && provider?.ussd_flow_id)) {
    if (flow?.is_enabled && flow.trigger_code) {
      return { ussd_code: flow.trigger_code, delivery_status: 'queued', delivery_notes: null };
    }
    return {
      ussd_code: null,
      delivery_status: 'failed',
      delivery_notes: 'Multi-step provider has no enabled USSD flow configured',
    };
  }

  // Single-step: expand the template into a full USSD string.
  if (method === 'single_step' || provider?.ussd_single_template) {
    const tpl = provider?.ussd_single_template?.trim();
    if (tpl) {
      return {
        ussd_code: expandSingleTemplate(tpl, topupAmount, receiverPhone, pin),
        delivery_status: 'queued',
        delivery_notes: null,
      };
    }
    return {
      ussd_code: null,
      delivery_status: 'failed',
      delivery_notes: 'Single-step provider has no ussd_single_template configured',
    };
  }

  return {
    ussd_code: null,
    delivery_status: 'failed',
    delivery_notes: 'Provider has no USSD method configured for jumlo',
  };
}
