import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Resolve USSD delivery method with priority package > category > provider
async function resolveUssdMethod(
  supabase: any,
  providerId: string,
  packageId: string | null,
  categoryId: string | null,
): Promise<'single_step' | 'interactive' | null> {
  if (packageId) {
    const { data } = await supabase.from('data_packages_config').select('ussd_method').eq('id', packageId).maybeSingle();
    if (data?.ussd_method) return data.ussd_method;
  }
  if (categoryId) {
    const { data } = await supabase.from('package_categories').select('ussd_method').eq('id', categoryId).maybeSingle();
    if (data?.ussd_method) return data.ussd_method;
  }
  if (providerId) {
    const { data } = await supabase.from('providers_config').select('ussd_method').eq('id', providerId).maybeSingle();
    if (data?.ussd_method) return data.ussd_method;
  }
  return null;
}

function buildUssdFromMethod(method: 'single_step' | 'interactive', receiver: string, amount: string, pin: string): string {
  if (method === 'interactive') return `*725*${amount}*${receiver}#`;
  return `*729*${receiver}*${amount}*${pin}#`;
}

// Sanitize a PIN string to digits-only (max 4). Falls back to default if empty.
// Used to guarantee delivery_queue.pin_code is always numeric so the Android
// USSD AccessibilityService never aborts with "Invalid PIN format".
function sanitizePin(raw: unknown, fallback = '5516'): string {
  const cleaned = String(raw ?? '').trim().replace(/\D/g, '').slice(0, 4);
  return cleaned || fallback;
}

// Compute USSD top-up amount: user_amount × (1 + provider evoucher_rate)
async function getProviderRate(supabase: any, providerId: string): Promise<number> {
  if (!providerId) return 0;
  const { data } = await supabase.from('providers_config').select('evoucher_rate').eq('id', providerId).maybeSingle();
  return Number(data?.evoucher_rate || 0);
}
function computeTopupAmount(userAmount: number, rate: number): number {
  return Number((Number(userAmount) * (1 + Number(rate || 0))).toFixed(2));
}

interface SMSData {
  sender_phone: string;
  receiver_sim: string;
  amount: number;
  sms_body: string;
  tx_id?: string;
  sms_timestamp?: number;
}

/**
 * Normalize Somali phone number to canonical 9-digit local format
 * 252685837139 -> 685837139
 * +252685837139 -> 685837139
 * 0685837139 -> 685837139
 * 685837139 -> 685837139
 */
function normalizeSomaliPhone(phone: string): string {
  // Remove all non-digits
  let digits = phone.replace(/\D/g, '');
  
  // Remove country code 252 prefix
  if (digits.startsWith('252') && digits.length >= 12) {
    digits = digits.substring(3);
  }
  
  // Remove leading 0
  if (digits.startsWith('0') && digits.length === 10) {
    digits = digits.substring(1);
  }
  
  // Return last 9 digits as canonical format
  return digits.slice(-9);
}

/**
 * Extract sender phone from SMS body text
 * Fallback when the sender_phone from metadata is truncated/wrong
 */
function extractSenderFromSmsBody(smsBody: string): string | null {
  if (!smsBody) return null;
  
  // Pattern: "ka heshay 252685837139" or "ka heshay 0685837139" or "ka heshay 685837139"
  const patterns = [
    /ka\s+heshay\s*[:\s]*(\+?252\d{9}|\d{9,12})/i,
    /waxaad.*?ka\s+heshay\s*[:\s]*(\+?252\d{9}|\d{9,12})/i,
    /received\s+from\s*[:\s]*(\+?252\d{9}|\d{9,12})/i,
    /lacag\s+ayaad\s+ka\s+heshay\s*[:\s]*(\+?252\d{9}|\d{9,12})/i,
    /received\s+airtime\s+from\s+(\+?252\d{9}|\d{9,12})/i,
    /ka.*?heshay.*?(\+?252\d{9}|\d{9,12})/i,
  ];
  
  for (const pattern of patterns) {
    const match = smsBody.match(pattern);
    if (match) {
      return normalizeSomaliPhone(match[1]);
    }
  }
  
  return null;
}

/**
 * Check if an active delivery already exists for an order (idempotency guard)
 */
async function hasActiveDelivery(supabase: any, orderId: string): Promise<boolean> {
  const { data } = await supabase
    .from('delivery_queue')
    .select('id')
    .eq('order_id', orderId)
    .in('status', ['pending', 'processing', 'completed'])
    .limit(1)
    .maybeSingle();
  return !!data;
}

/**
 * Check if a pending_online_payment was already matched to an order
 */
async function pendingAlreadyMatched(supabase: any, pendingId: string): Promise<boolean> {
  const { data } = await supabase
    .from('pending_online_payments')
    .select('id, status')
    .eq('id', pendingId)
    .single();
  return data?.status === 'matched';
}

/**
 * Queue delivery with bundling support.
 * Checks package_delivery_rules for the source package.
 * If rules exist, creates multiple delivery_queue entries with scheduled delays.
 * Otherwise, returns null so caller does default single insert.
 */
async function queueDeliveryWithBundling(
  supabase: any,
  orderId: string,
  sourcePackageId: string,
  providerId: string,
  receiverPhone: string,
  providerSlug: string
) {
  // Idempotency: skip if active delivery already exists for this order
  if (await hasActiveDelivery(supabase, orderId)) {
    console.log('⚠️ Skipping bundled queue — active delivery already exists for order:', orderId);
    return []; // Return non-null to prevent caller from doing default insert
  }

  const { data: rules } = await supabase
    .from('package_delivery_rules')
    .select('*')
    .eq('source_package_id', sourcePackageId)
    .eq('is_active', true)
    .order('execution_order', { ascending: true });

  if (!rules || rules.length === 0) return null;

  console.log(`📦 Bundling rules found: ${rules.length} rules for package ${sourcePackageId}`);
  const queueItems: any[] = [];

  for (const rule of rules) {
    const { data: targetPkg } = await supabase
      .from('data_packages_config')
      .select('*, category_id')
      .eq('id', rule.target_package_id)
      .single();
    if (!targetPkg) continue;

    let instruction: any = null;
    const { data: pkgI } = await supabase.from('delivery_instructions').select('code_template, sim_password').eq('provider_id', providerId).eq('package_id', rule.target_package_id).maybeSingle();
    if (pkgI?.code_template) { instruction = pkgI; }
    else if (targetPkg.category_id) {
      const { data: catI } = await supabase.from('delivery_instructions').select('code_template, sim_password').eq('provider_id', providerId).eq('category_id', targetPkg.category_id).is('package_id', null).maybeSingle();
      if (catI?.code_template) instruction = catI;
    }
    if (!instruction) {
      const { data: provI } = await supabase.from('delivery_instructions').select('code_template, sim_password').eq('provider_id', providerId).is('category_id', null).is('package_id', null).maybeSingle();
      if (provI?.code_template) instruction = provI;
    }
    if (!instruction?.code_template) continue;

    const fmtAmt = (a: number) => { if (Number.isInteger(a)) return a.toString(); const f = Number(a).toFixed(2); return a < 1 ? f.replace('.','') : f.replace('.','*'); };
    const normPh = (p: string) => { let d = (p||'').replace(/^\+/,''); if (d.startsWith('252')) d = d.substring(3); return d.slice(-9); };
    const _rate = await getProviderRate(supabase, providerId);
    const _topup = computeTopupAmount(Number(targetPkg.cost_price), _rate);
    const _amt = fmtAmt(_topup);
    const _rcv = normPh(receiverPhone);
    const _pin = instruction.sim_password||'5516';
    const _method = await resolveUssdMethod(supabase, providerId, rule.target_package_id, targetPkg.category_id);
    const ussd = _method ? buildUssdFromMethod(_method, _rcv, _amt, _pin) : instruction.code_template.replace('{receiver_phone}', _rcv).replace('{package_code}', targetPkg.ussd_code||'').replace('{cost_price}', _amt).replace('{sim_password}', _pin);

    for (let i = 0; i < rule.delivery_count; i++) {
      const delayMs = rule.delay_minutes * i * 60000;
      queueItems.push({
        order_id: orderId, provider_name: providerSlug, ussd_code: ussd,
        receiver_phone: receiverPhone, package_code: targetPkg.ussd_code,
        status: delayMs === 0 ? 'pending' : 'scheduled',
        scheduled_at: new Date(Date.now() + delayMs).toISOString(),
        topup_amount: _topup,
        pin_code: sanitizePin(_pin),
      });
    }
  }

  if (queueItems.length > 0) {
    const { data: inserted, error: qErr } = await supabase.from('delivery_queue').insert(queueItems).select();
    if (qErr) console.error('❌ Bundled queue error:', qErr);
    else console.log(`📬 Bundled: ${inserted.length} deliveries queued`);
    return inserted;
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { sender_phone, receiver_sim, amount, sms_body, tx_id, sms_timestamp }: SMSData = await req.json();

    // ========================================
    // NORMALIZE SENDER PHONE
    // ========================================
    let normalizedSender = normalizeSomaliPhone(sender_phone);
    
    // If normalized sender looks wrong (too short), try extracting from SMS body
    if (normalizedSender.length < 9) {
      const bodyExtracted = extractSenderFromSmsBody(sms_body);
      if (bodyExtracted && bodyExtracted.length === 9) {
        console.log('🔧 Sender extracted from SMS body (metadata was truncated):', { original: sender_phone, extracted: bodyExtracted });
        normalizedSender = bodyExtracted;
      }
    }
    
    // Double-check: if the normalized sender from metadata doesn't match what's in the SMS body,
    // prefer the SMS body extraction (catches truncation bugs)
    const bodyExtracted = extractSenderFromSmsBody(sms_body);
    if (bodyExtracted && bodyExtracted.length === 9 && bodyExtracted !== normalizedSender) {
      console.log('🔧 Sender corrected from SMS body:', { metadata: normalizedSender, smsBody: bodyExtracted });
      normalizedSender = bodyExtracted;
    }

    console.log('📱 SMS Received:', { sender_phone, normalizedSender, receiver_sim, amount, tx_id });

    // Block check moved AFTER receipt insert — so blocked SMS still gets logged

    // ========================================
    // DUPLICATE CHECK 1: Check by tx_id  
    // ========================================
    if (tx_id) {
      const { data: existingByTxId } = await supabase
        .from('payment_receipts')
        .select('id, matched_order_id')
        .eq('tx_id', tx_id)
        .maybeSingle();

      if (existingByTxId) {
        console.log('⚠️ Duplicate detected by tx_id:', tx_id);
        return new Response(
          JSON.stringify({
            success: true,
            message: 'SMS already processed (tx_id duplicate)',
            duplicate: true,
            order_id: existingByTxId.matched_order_id
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }
    }

    // ========================================
    // DUPLICATE CHECK 2: Same sender + amount within 60 seconds
    // Use normalized sender for dedup check
    // ========================================
    const sixtySecondsAgo = new Date(Date.now() - 60000).toISOString();
    const { data: recentReceipts } = await supabase
      .from('payment_receipts')
      .select('id, matched_order_id, created_at')
      .eq('sender_phone', normalizedSender)
      .eq('amount', amount)
      .gte('created_at', sixtySecondsAgo)
      .order('created_at', { ascending: false })
      .limit(1);

    if (recentReceipts && recentReceipts.length > 0) {
      console.log('⚠️ Duplicate detected: same sender + amount within 60s:', {
        sender_phone: normalizedSender,
        amount,
        existing_id: recentReceipts[0].id
      });
      return new Response(
        JSON.stringify({
          success: true,
          message: 'SMS already processed (time-based duplicate)',
          duplicate: true,
          order_id: recentReceipts[0].matched_order_id
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Generate payment_hash with normalized sender
    const minuteBucket = Math.floor(Date.now() / 60000);
    const paymentHash = `${normalizedSender}_${amount}_${minuteBucket}`;

    // STEP 1: Insert payment receipt with NORMALIZED sender
    const { data: receipt, error: receiptError } = await supabase
      .from('payment_receipts')
      .insert({
        sender_phone: normalizedSender,
        receiver_sim: receiver_sim.toLowerCase(),
        amount,
        sms_body,
        tx_id,
        payment_hash: paymentHash,
        status: 'pending'
      })
      .select()
      .single();

    if (receiptError) {
      if (receiptError.code === '23505') {
        console.log('⚠️ Duplicate detected on insert (hash or tx_id):', { tx_id, paymentHash });
        return new Response(
          JSON.stringify({
            success: true,
            message: 'SMS already processed (duplicate constraint)',
            duplicate: true
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }
      console.error('❌ Receipt insert error:', receiptError);
      throw receiptError;
    }

    console.log('💾 Receipt saved:', receipt.id);

    // ========================================
    // BLOCK CHECK (after receipt saved — so SMS is always logged)
    // ========================================
    const { data: isBlocked } = await supabase.rpc('is_phone_blocked', { p_phone: normalizedSender });
    if (isBlocked) {
      // Get block reason
      const { data: blockRecord } = await supabase
        .from('blocked_users')
        .select('reason')
        .eq('phone_number', normalizedSender)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      const blockReason = blockRecord?.reason || 'No reason provided';

      // Look up offline registration to show what they were trying to buy
      const senderVariantsForBlock = [
        normalizedSender,
        `0${normalizedSender}`,
        `252${normalizedSender}`,
        `+252${normalizedSender}`,
      ];

      const { data: offlineReg } = await supabase
        .from('offline_registrations')
        .select('receiver_phone, provider_name')
        .in('sender_phone', senderVariantsForBlock)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      // Find what package they would have gotten
      let packageInfo = '';
      if (offlineReg) {
        const { data: regProvider } = await supabase
          .from('providers_config')
          .select('id, provider_name')
          .ilike('provider_name', `%${offlineReg.provider_name}%`)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        if (regProvider) {
          const { data: matchPkg } = await supabase
            .from('data_packages_config')
            .select('package_name, data_amount')
            .eq('provider_id', regProvider.id)
            .eq('selling_price', amount)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();

          if (matchPkg) {
            packageInfo = ` | Package: ${matchPkg.package_name} (${matchPkg.data_amount})`;
          }
        }
      }

      const receiverInfo = offlineReg ? ` | Receiver: ${offlineReg.receiver_phone} (${offlineReg.provider_name})` : '';
      const fullBlockNote = `Blocked user: ${blockReason}${receiverInfo}${packageInfo}`;

      console.log('🚫 Blocked user payment logged but rejected:', normalizedSender, 'Reason:', blockReason);

      // Update receipt status to 'blocked' with reason + order details
      await supabase.from('payment_receipts').update({
        status: 'blocked',
        processed_at: new Date().toISOString(),
        admin_notes: fullBlockNote,
      }).eq('id', receipt.id);

      return new Response(
        JSON.stringify({ success: true, message: 'Payment logged but sender is blocked', blocked: true, reason: blockReason }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // ========================================
    // FRAUD DETECTION CHECK
    // ========================================
    try {
      await supabase.rpc('check_fraud_rules', {
        p_sender_phone: normalizedSender,
        p_amount: amount,
        p_receipt_id: receipt.id,
      });
      console.log('🔍 Fraud check completed');
    } catch (fraudErr) {
      console.error('⚠️ Fraud check error (non-blocking):', fraudErr);
    }

    // ========================================
    // Helper: Match sender against DB records using multiple format variants
    // ========================================
    const senderVariants = [
      normalizedSender,                    // 685837139
      `0${normalizedSender}`,              // 0685837139
      `252${normalizedSender}`,            // 252685837139
      `+252${normalizedSender}`,           // +252685837139
    ];

    // ========================================
    // PRIORITY -1: AUTO TOP-UP CHECK
    // ========================================
    // receiver_sim from Android = provider name ("somnet"/"hormuud"), not phone number
    // Match auto_topup_numbers by provider prefix instead
    const receiverProvider = receiver_sim.toLowerCase();
    let autoTopupPrefixes: string[] = [];
    if (receiverProvider.includes('somnet')) {
      autoTopupPrefixes = ['68'];
    } else if (receiverProvider.includes('hormuud')) {
      autoTopupPrefixes = ['61', '77'];
    } else if (receiverProvider.includes('somtel')) {
      autoTopupPrefixes = ['62'];
    }
    console.log(`🔍 Auto top-up check: receiver_sim="${receiver_sim}" → prefixes: [${autoTopupPrefixes.join(',')}]`);

    // Fetch all active auto_topup_numbers and find one matching the provider prefix
    const { data: allAutoTopup } = await supabase
      .from('auto_topup_numbers')
      .select('*')
      .eq('is_active', true);

    const autoTopup = allAutoTopup?.find(n => {
      const norm = normalizeSomaliPhone(n.phone_number);
      return autoTopupPrefixes.some(p => norm.startsWith(p));
    }) || null;

    if (autoTopup) {
      console.log('🔄 Auto top-up number detected:', autoTopup.phone_number);

      // Detect provider from sender prefix
      const senderPrefix2 = normalizedSender.substring(0, 2);
      let providerSearch = '';
      if (senderPrefix2 === '61' || senderPrefix2 === '77') {
        providerSearch = 'hormuud';
      } else if (senderPrefix2 === '68') {
        providerSearch = 'somnet';
      } else {
        providerSearch = 'hormuud'; // default fallback
      }
      console.log(`📡 Sender prefix "${senderPrefix2}" → provider: ${providerSearch}`);

      // Find provider
      const { data: detectedProvider } = await supabase
        .from('providers_config')
        .select('id, provider_name')
        .ilike('provider_name', `%${providerSearch}%`)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (detectedProvider) {
        // Find package matching amount + provider
        const { data: matchingPackages } = await supabase
          .from('data_packages_config')
          .select('*, category_id')
          .eq('provider_id', detectedProvider.id)
          .eq('selling_price', amount)
          .eq('is_active', true)
          .order('selling_price', { ascending: true })
          .limit(1);

        if (matchingPackages && matchingPackages.length > 0) {
          const pkg = matchingPackages[0];
          console.log(`✅ Auto top-up match: ${pkg.package_name} ($${amount}) for ${detectedProvider.provider_name}`);

          // Get payment provider
          const { data: paymentProv } = await supabase
            .from('payment_providers_config')
            .select('id')
            .eq('is_active', true)
            .order('created_at', { ascending: true })
            .limit(1)
            .single();

          // Create order
          const { data: autoOrder, error: autoOrderErr } = await supabase
            .from('orders')
            .insert({
              customer_phone: normalizedSender,
              sender_phone: normalizedSender,
              receiver_phone: normalizedSender,
              provider_id: detectedProvider.id,
              package_id: pkg.id,
              package_name: pkg.package_name,
              data_amount: pkg.data_amount,
              selling_price: amount,
              payment_provider_id: paymentProv?.id,
              payment_number: autoTopup.phone_number,
              payment_source: 'auto_topup',
              status: 'completed',
              delivery_status: 'queued'
            })
            .select()
            .single();

          if (autoOrderErr) {
            console.error('❌ Auto top-up order error:', autoOrderErr);
          } else {
            console.log('📝 Auto top-up order created:', autoOrder.id);

            // Update receipt
            await supabase.from('payment_receipts').update({
              status: 'matched',
              matched_order_id: autoOrder.id,
              matching_strategy: 'auto_topup',
              processed_at: new Date().toISOString(),
              admin_notes: `Auto top-up: ${pkg.package_name} for sender ${normalizedSender} via ${detectedProvider.provider_name}`
            }).eq('id', receipt.id);

            // Queue delivery with bundling support
            const normalizeProviderSlug = (name: string) => {
              const lower = name.toLowerCase();
              if (lower.includes('hormuud')) return 'hormuud';
              if (lower.includes('somnet')) return 'somnet';
              if (lower.includes('somtel')) return 'somtel';
              if (lower.includes('amtel')) return 'amtel';
              if (lower.includes('somlink')) return 'somlink';
              return lower.split(' ')[0];
            };
            const providerSlug = normalizeProviderSlug(detectedProvider.provider_name);

            const bundled = await queueDeliveryWithBundling(supabase, autoOrder.id, pkg.id, detectedProvider.id, normalizedSender, providerSlug);

            if (!bundled) {
              // Get delivery instruction
              let instruction: any = null;
              const { data: pkgI } = await supabase.from('delivery_instructions').select('code_template, sim_password').eq('provider_id', detectedProvider.id).eq('package_id', pkg.id).maybeSingle();
              if (pkgI?.code_template) { instruction = pkgI; }
              else if (pkg.category_id) {
                const { data: catI } = await supabase.from('delivery_instructions').select('code_template, sim_password').eq('provider_id', detectedProvider.id).eq('category_id', pkg.category_id).is('package_id', null).maybeSingle();
                if (catI?.code_template) instruction = catI;
              }
              if (!instruction) {
                const { data: provI } = await supabase.from('delivery_instructions').select('code_template, sim_password').eq('provider_id', detectedProvider.id).is('category_id', null).is('package_id', null).maybeSingle();
                if (provI?.code_template) instruction = provI;
              }

              if (instruction?.code_template) {
                const formatAmountForUssd = (amt: number) => {
                  if (Number.isInteger(amt)) return amt.toString();
                  const f = Number(amt).toFixed(2);
                  if (amt < 1) return f.replace('.', '');
                  return f.replace('.', '*');
                };
                const normalizePhoneForProvider = (phone: string) => {
                  let p = (phone || '').replace(/^\+/, '');
                  if (p.startsWith('252')) p = p.substring(3);
                  return p.slice(-9);
                };
                const _rate2 = await getProviderRate(supabase, detectedProvider.id);
                const _topup2 = computeTopupAmount(Number(pkg.cost_price), _rate2);
                const _amt2 = formatAmountForUssd(_topup2);
                const _rcv2 = normalizePhoneForProvider(normalizedSender);
                const _pin2 = instruction.sim_password || '5516';
                const _method2 = await resolveUssdMethod(supabase, detectedProvider.id, pkg.id, pkg.category_id);
                const ussdCode = _method2 ? buildUssdFromMethod(_method2, _rcv2, _amt2, _pin2) : instruction.code_template
                  .replace('{receiver_phone}', _rcv2)
                  .replace('{package_code}', pkg.ussd_code || '')
                  .replace('{cost_price}', _amt2)
                  .replace('{sim_password}', _pin2);

                await supabase.from('delivery_queue').insert({
                  order_id: autoOrder.id,
                  provider_name: providerSlug,
                  ussd_code: ussdCode,
                  receiver_phone: normalizedSender,
                  package_code: pkg.ussd_code,
                  status: 'pending',
                  topup_amount: _topup2,
                  pin_code: sanitizePin(_pin2),
                });
                console.log('📬 Auto top-up delivery queued');
              } else {
                console.log('⚠️ No delivery instruction for auto top-up');
                await supabase.from('orders').update({ delivery_status: 'failed', delivery_notes: 'No delivery instruction configured' }).eq('id', autoOrder.id);
              }
            }

            return new Response(
              JSON.stringify({ success: true, message: 'Auto top-up matched and delivered', order_id: autoOrder.id, matching_strategy: 'auto_topup' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            );
          }
        } else {
          console.log(`⚠️ Auto top-up: no package found for $${amount} on ${detectedProvider.provider_name}`);
          await supabase.from('payment_receipts').update({
            status: 'unmatched',
            admin_notes: `Auto top-up: no package found for $${amount} on ${detectedProvider.provider_name} (sender prefix: ${senderPrefix2})`
          }).eq('id', receipt.id);

          return new Response(
            JSON.stringify({ success: true, message: 'Auto top-up number matched but no package found', matching_strategy: 'auto_topup_no_package' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          );
        }
      } else {
        console.log(`⚠️ Auto top-up: provider not found for prefix "${senderPrefix2}"`);
        await supabase.from('payment_receipts').update({
          status: 'unmatched',
          admin_notes: `Auto top-up: provider not found for sender prefix "${senderPrefix2}"`
        }).eq('id', receipt.id);

        return new Response(
          JSON.stringify({ success: true, message: 'Auto top-up: provider not detected', matching_strategy: 'auto_topup_no_provider' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }
    }

    // ========================================
    // PRIORITY 0: Check pending_online_payments FIRST
    // ========================================
    const thirtyMinutesAgo = new Date(Date.now() - 1800000).toISOString();
    
    // Try matching by sender_phone first (lambarka lacagta laga diray), then verified_phone (lambarka App-ka)
    let pendingOnline = null;
    let pendingOnlineError = null;

    // Attempt 1: Match by sender_phone (most accurate - the actual number used to pay)
    const { data: pendingBySenderPhone, error: err1 } = await supabase
      .from('pending_online_payments')
      .select('*')
      .in('sender_phone', senderVariants)
      .eq('status', 'pending')
      .gte('created_at', thirtyMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingBySenderPhone) {
      pendingOnline = pendingBySenderPhone;
    } else {
      // Attempt 2: Fallback to verified_phone matching (the phone used to login to app)
      const { data: pendingBySender, error: err2 } = await supabase
        .from('pending_online_payments')
        .select('*')
        .in('verified_phone', senderVariants)
        .eq('status', 'pending')
        .gte('created_at', thirtyMinutesAgo)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      pendingOnline = pendingBySender;
      pendingOnlineError = err2;
    }
    if (err1) pendingOnlineError = err1;

    if (pendingOnlineError) {
      console.error('❌ Error checking pending_online_payments:', pendingOnlineError);
    }

    if (pendingOnline) {
      const expectedAmount = Number(pendingOnline.expected_amount);
      const smsAmount = Number(amount);
      const amountMatches = Math.abs(expectedAmount - smsAmount) < 0.01;
      
      if (amountMatches) {
        // Idempotency: check if this pending payment was already matched by a concurrent invocation
        if (await pendingAlreadyMatched(supabase, pendingOnline.id)) {
          console.log('⚠️ Pending online payment already matched (concurrent), skipping:', pendingOnline.id);
          await supabase.from('payment_receipts').update({ status: 'duplicate', admin_notes: 'Concurrent match - pending already processed' }).eq('id', receipt.id);
          return new Response(JSON.stringify({ success: true, message: 'Already matched (concurrent)', duplicate: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // Mark as matched FIRST (atomic lock) before creating order
        const { data: lockResult } = await supabase
          .from('pending_online_payments')
          .update({ status: 'matched' })
          .eq('id', pendingOnline.id)
          .eq('status', 'pending')  // Only if still pending (optimistic lock)
          .select('id');
        
        if (!lockResult || lockResult.length === 0) {
          console.log('⚠️ Failed to lock pending payment (already claimed):', pendingOnline.id);
          await supabase.from('payment_receipts').update({ status: 'duplicate', admin_notes: 'Failed to lock pending payment - already claimed' }).eq('id', receipt.id);
          return new Response(JSON.stringify({ success: true, message: 'Already claimed', duplicate: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        console.log('✅ Found pending online payment:', pendingOnline.id, 'intent_type:', pendingOnline.intent_type);

        // ============================================================
        // BRANCH: JUMLO (wholesale top-up via multi-step USSD flow)
        // ============================================================
        if (pendingOnline.intent_type === 'jumlo') {
          const { data: providerData } = await supabase
            .from('providers_config')
            .select('provider_name, ussd_method, ussd_flow_id, ussd_single_template')
            .eq('id', pendingOnline.provider_id)
            .single();

          // Resolve USSD flow row when provider uses multi_step
          let flowRow: { trigger_code: string; is_enabled: boolean } | null = null;
          if (providerData?.ussd_flow_id) {
            const { data: f } = await supabase
              .from('ussd_flows')
              .select('trigger_code, is_enabled')
              .eq('id', providerData.ussd_flow_id)
              .maybeSingle();
            if (f) flowRow = { trigger_code: f.trigger_code, is_enabled: !!f.is_enabled };
          }

          // topup_amount = smsAmount × (1 + tier.profit_rate/100)
          // Use the wholesale tier's profit_rate (percent) for THIS provider.
          let tierProfitRate = 0;
          if (pendingOnline.tier_id) {
            const { data: tierRow } = await supabase
              .from('provider_wholesale_tiers')
              .select('profit_rate')
              .eq('id', pendingOnline.tier_id)
              .maybeSingle();
            tierProfitRate = Number(tierRow?.profit_rate || 0);
          }
          // Fallback: match by provider + amount range
          if (!tierProfitRate) {
            const { data: tierMatch } = await supabase
              .from('provider_wholesale_tiers')
              .select('profit_rate')
              .eq('provider_id', pendingOnline.provider_id)
              .eq('is_active', true)
              .lte('min_amount', smsAmount)
              .gte('max_amount', smsAmount)
              .order('min_amount', { ascending: false })
              .limit(1)
              .maybeSingle();
            tierProfitRate = Number(tierMatch?.profit_rate || 0);
          }
          const topupAmount = Number((Number(smsAmount) * (1 + tierProfitRate / 100)).toFixed(2));
          console.log('🧮 Jumlo tier rate:', { tier_id: pendingOnline.tier_id, tierProfitRate, smsAmount, topupAmount });

          // Fetch sim_password from delivery_instructions for this provider (provider default)
          let jumloPin = '5516';
          const { data: provInstr } = await supabase
            .from('delivery_instructions')
            .select('sim_password')
            .eq('provider_id', pendingOnline.provider_id)
            .is('category_id', null)
            .is('package_id', null)
            .maybeSingle();
          if (provInstr?.sim_password) jumloPin = provInstr.sim_password;

          const { resolveJumloDispatch } = await import('./jumloResolver.ts');
          const dispatch = resolveJumloDispatch(
            providerData as any,
            flowRow,
            topupAmount,
            pendingOnline.receiver_phone,
            jumloPin,
          );
          console.log('🧮 Jumlo computed:', { smsAmount, tierProfitRate, topupAmount, jumloPin, ussd: dispatch.ussd_code });
          const normalizeProviderSlug = (name: string) => {
            const lower = (name || '').toLowerCase();
            if (lower.includes('hormuud')) return 'hormuud';
            if (lower.includes('somnet')) return 'somnet';
            if (lower.includes('somtel')) return 'somtel';
            if (lower.includes('amtel')) return 'amtel';
            if (lower.includes('somlink')) return 'somlink';
            return lower.split(' ')[0];
          };
          const providerSlug = normalizeProviderSlug(providerData?.provider_name || '');

          const { data: newOrder, error: orderError } = await supabase
            .from('orders')
            .insert({
              intent_id: pendingOnline.id,
              customer_phone: normalizeSomaliPhone(pendingOnline.sender_phone || pendingOnline.verified_phone),
              sender_phone: normalizeSomaliPhone(pendingOnline.sender_phone || pendingOnline.verified_phone),
              receiver_phone: pendingOnline.receiver_phone,
              provider_id: pendingOnline.provider_id,
              package_id: null,
              package_name: `Jumlo ${providerData?.provider_name || ''}`.trim(),
              data_amount: `$${topupAmount}`,
              selling_price: smsAmount,
              payment_provider_id: (await supabase.from('payment_providers_config').select('id').eq('is_active', true).order('created_at', { ascending: true }).limit(1).single()).data?.id,
              payment_number: '617195659',
              payment_source: 'ussd_online',
              status: 'completed',
              delivery_status: dispatch.delivery_status,
              delivery_notes: dispatch.delivery_notes,
            })
            .select()
            .single();

          if (orderError) {
            if (orderError.code === '23505') {
              const { data: existingOrder } = await supabase.from('orders').select('id').eq('intent_id', pendingOnline.id).single();
              await supabase.from('payment_receipts').update({ status: 'duplicate', matched_order_id: existingOrder?.id, matching_strategy: 'idempotent_intent_id', processed_at: new Date().toISOString() }).eq('id', receipt.id);
              return new Response(JSON.stringify({ success: true, message: 'Already created', duplicate: true, order_id: existingOrder?.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
            }
            throw orderError;
          }

          await supabase
            .from('payment_receipts')
            .update({
              status: 'matched',
              matched_order_id: newOrder.id,
              matching_strategy: 'pending_jumlo_payment',
              processed_at: new Date().toISOString(),
              admin_notes: `Auto-matched JUMLO - $${topupAmount} → ${pendingOnline.receiver_phone} (${providerData?.provider_name})`,
            })
            .eq('id', receipt.id);

          if (dispatch.ussd_code) {
            const { error: queueError } = await supabase
              .from('delivery_queue')
              .insert({
                order_id: newOrder.id,
                provider_name: providerSlug,
                ussd_code: dispatch.ussd_code,
                receiver_phone: pendingOnline.receiver_phone,
                package_code: null,
                status: 'pending',
                topup_amount: topupAmount,
                pin_code: sanitizePin(jumloPin),
              });
            if (queueError) console.error('❌ Jumlo queue error:', queueError);
            else console.log('📬 Jumlo queued:', dispatch.ussd_code, 'topup', topupAmount, '→', pendingOnline.receiver_phone);
          }

          return new Response(
            JSON.stringify({ success: true, message: 'Jumlo payment matched', order_id: newOrder.id, matching_strategy: 'pending_jumlo_payment' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          );
        }

        // ============================================================
        // BRANCH: PACKAGE (existing flow)
        // ============================================================
        const { data: packageData } = await supabase
          .from('data_packages_config')
          .select('*, category_id')
          .eq('id', pendingOnline.package_id)
          .single();

        const { data: providerData } = await supabase
          .from('providers_config')
          .select('provider_name')
          .eq('id', pendingOnline.provider_id)
          .single();

        const { data: paymentProvider } = await supabase
          .from('payment_providers_config')
          .select('id')
          .eq('is_active', true)
          .order('created_at', { ascending: true })
          .limit(1)
          .single();

        const { data: newOrder, error: orderError } = await supabase
          .from('orders')
          .insert({
            intent_id: pendingOnline.id, // HARD IDEMPOTENCY: prevents duplicate orders per intent
            customer_phone: normalizeSomaliPhone(pendingOnline.sender_phone || pendingOnline.verified_phone),
            sender_phone: normalizeSomaliPhone(pendingOnline.sender_phone || pendingOnline.verified_phone),
            receiver_phone: pendingOnline.receiver_phone,
            provider_id: pendingOnline.provider_id,
            package_id: pendingOnline.package_id,
            package_name: packageData?.package_name || 'Data Package',
            data_amount: packageData?.data_amount || '',
            selling_price: smsAmount,
            payment_provider_id: paymentProvider?.id,
            payment_number: '617195659',
            payment_source: 'ussd_online',
            status: 'completed',
            delivery_status: 'queued'
          })
          .select()
          .single();

        if (orderError) {
          // 23505 = unique violation on intent_id → another path already created order for this intent
          if (orderError.code === '23505') {
            const { data: existingOrder } = await supabase
              .from('orders').select('id').eq('intent_id', pendingOnline.id).single();
            console.log('⚠️ Order already exists for intent (idempotent skip):', existingOrder?.id);
            await supabase.from('payment_receipts').update({
              status: 'duplicate',
              matched_order_id: existingOrder?.id,
              matching_strategy: 'idempotent_intent_id',
              admin_notes: 'Order already created for this intent (likely WaafiPay API + SMS race)',
              processed_at: new Date().toISOString(),
            }).eq('id', receipt.id);
            return new Response(JSON.stringify({ success: true, message: 'Already created', duplicate: true, order_id: existingOrder?.id }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
          }
          console.error('❌ Error creating order from pending payment:', orderError);
          throw orderError;
        }

        console.log('📝 Order created from pending payment:', newOrder.id);

        // (pending_online_payments already marked as 'matched' above via optimistic lock)

        await supabase
          .from('payment_receipts')
          .update({
            status: 'matched',
            matched_order_id: newOrder.id,
            matching_strategy: 'pending_online_payment',
            processed_at: new Date().toISOString(),
            admin_notes: `Auto-matched to pending online payment - ${packageData?.package_name} for ${pendingOnline.receiver_phone}`
          })
          .eq('id', receipt.id);

        // Get delivery instructions
        const { data: instruction } = await supabase
          .from('delivery_instructions')
          .select('*')
          .eq('provider_id', pendingOnline.provider_id)
          .eq('category_id', packageData?.category_id)
          .maybeSingle();

        if (instruction && packageData) {
          const normalizeProviderSlug = (name: string) => {
            const lower = name.toLowerCase();
            if (lower.includes('hormuud')) return 'hormuud';
            if (lower.includes('somnet')) return 'somnet';
            if (lower.includes('somtel')) return 'somtel';
            if (lower.includes('amtel')) return 'amtel';
            if (lower.includes('somlink')) return 'somlink';
            return lower.split(' ')[0];
          };
          const providerSlug = normalizeProviderSlug(providerData?.provider_name || '');

          // Try bundling first
          const bundled = await queueDeliveryWithBundling(supabase, newOrder.id, pendingOnline.package_id, pendingOnline.provider_id, pendingOnline.receiver_phone, providerSlug);
          
          if (!bundled) {
            // No bundling rules — default single delivery
            const formatAmountForUssd = (amt: number) => {
              if (Number.isInteger(amt)) return amt.toString();
              const f = Number(amt).toFixed(2);
              if (amt < 1) return f.replace('.', '');
              return f.replace('.', '*');
            };
            const normalizePhoneForProvider = (phone: string) => {
              let p = (phone || '').replace(/^\+/, '');
              if (p.startsWith('252')) p = p.substring(3);
              return p.slice(-9);
            };
            const receiverForUssd = normalizePhoneForProvider(pendingOnline.receiver_phone);
            const _rate3 = await getProviderRate(supabase, pendingOnline.provider_id);
            const _topup3 = computeTopupAmount(Number(pendingOnline.expected_amount ?? packageData.cost_price), _rate3);
            const costPriceFormatted = formatAmountForUssd(_topup3);
            const _pin3 = instruction.sim_password || '5516';
            const _method3 = await resolveUssdMethod(supabase, pendingOnline.provider_id, packageData.id, packageData.category_id);
            const ussdCode = _method3 ? buildUssdFromMethod(_method3, receiverForUssd, costPriceFormatted, _pin3) : instruction.code_template
              .replace('{receiver_phone}', receiverForUssd)
              .replace('{package_code}', packageData.ussd_code || '')
              .replace('{cost_price}', costPriceFormatted)
              .replace('{sim_password}', _pin3);

            const { error: queueError } = await supabase
              .from('delivery_queue')
              .insert({
                order_id: newOrder.id,
                provider_name: providerSlug,
                ussd_code: ussdCode,
                receiver_phone: pendingOnline.receiver_phone,
                package_code: packageData.ussd_code,
                status: 'pending',
                topup_amount: _topup3,
                pin_code: sanitizePin(_pin3),
              });
            if (queueError) console.error('❌ Queue error:', queueError);
            else console.log('📬 Online payment queued for delivery');
          }
        } else {
          console.log('⚠️ No delivery instruction found for pending online payment');
          await supabase
            .from('orders')
            .update({ 
              delivery_status: 'failed', 
              delivery_notes: 'No delivery instruction configured' 
            })
            .eq('id', newOrder.id);
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Pending online payment matched and order created',
            order_id: newOrder.id,
            matching_strategy: 'pending_online_payment'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      } else {
        // ========================================
        // EXPLICIT AMOUNT MISMATCH HANDLING
        // ========================================
        // Pending online intent EXISTS but amount sent doesn't match.
        // Do NOT fall back to offline_registrations — surface the real issue to admin.
        console.log('⚠️ Found pending online payment but amount mismatch:', { expectedAmount, smsAmount, sender: normalizedSender });

        // Fetch package + provider info for richer admin diagnostics
        let pkgName = '';
        let provName = '';
        try {
          if (pendingOnline.package_id) {
            const { data: pkgRow } = await supabase
              .from('data_packages_config')
              .select('package_name')
              .eq('id', pendingOnline.package_id)
              .maybeSingle();
            pkgName = pkgRow?.package_name || '';
          }
          if (pendingOnline.provider_id) {
            const { data: provRow } = await supabase
              .from('providers_config')
              .select('provider_name')
              .eq('id', pendingOnline.provider_id)
              .maybeSingle();
            provName = provRow?.provider_name || '';
          }
        } catch (e) {
          console.warn('⚠️ Could not enrich pending intent details:', e);
        }

        const mismatchNote =
          `Pending online payment found but amount mismatch | ` +
          `Expected: $${expectedAmount} | Received: $${smsAmount} | ` +
          `Receiver: ${pendingOnline.receiver_phone}` +
          (pkgName ? ` | Package: ${pkgName}` : '') +
          (provName ? ` | Provider: ${provName}` : '');

        await supabase
          .from('payment_receipts')
          .update({
            status: 'unmatched',
            matching_strategy: 'amount_mismatch',
            admin_notes: mismatchNote,
            processed_at: new Date().toISOString(),
          })
          .eq('id', receipt.id);

        return new Response(
          JSON.stringify({
            success: false,
            message: 'Pending online payment found but amount mismatch',
            matching_strategy: 'amount_mismatch',
            expected_amount: expectedAmount,
            received_amount: smsAmount,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }
    }

    // ========================================
    // PRIORITY 0.5: Check for RECENTLY MATCHED online intent (delayed/duplicate SMS)
    // If a recent online intent for this sender was already matched with a similar
    // amount, the SMS is likely a delayed duplicate — DO NOT route to offline fallback.
    // ========================================
    const tenMinutesAgo = new Date(Date.now() - 600000).toISOString();
    const { data: recentMatchedIntent } = await supabase
      .from('pending_online_payments')
      .select('id, expected_amount, receiver_phone, status, created_at')
      .or(`sender_phone.in.(${senderVariants.map(v => `"${v}"`).join(',')}),verified_phone.in.(${senderVariants.map(v => `"${v}"`).join(',')})`)
      .eq('status', 'matched')
      .gte('created_at', tenMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentMatchedIntent) {
      const intentAmt = Number(recentMatchedIntent.expected_amount);
      const smsAmt = Number(amount);
      if (Math.abs(intentAmt - smsAmt) < 0.01) {
        console.log('⚠️ Late/duplicate SMS for already-matched online intent:', recentMatchedIntent.id);
        await supabase
          .from('payment_receipts')
          .update({
            status: 'duplicate',
            matching_strategy: 'late_duplicate_online',
            admin_notes: `Recent online payment already matched | Intent: ${recentMatchedIntent.id} | Receiver: ${recentMatchedIntent.receiver_phone} | Amount: $${intentAmt}`,
            processed_at: new Date().toISOString(),
          })
          .eq('id', receipt.id);
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Late/duplicate SMS for already-matched online payment',
            duplicate: true,
            matching_strategy: 'late_duplicate_online',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }
    }

    // ========================================
    // PRIORITY 1: Check for pending_payment orders (Legacy flow)
    // ========================================
    const { data: pendingOrder, error: pendingOrderError } = await supabase
      .from('orders')
      .select('*')
      .in('sender_phone', senderVariants)
      .eq('status', 'pending_payment')
      .gte('created_at', thirtyMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingOrderError) {
      console.error('❌ Error checking pending orders:', pendingOrderError);
    }

    if (pendingOrder) {
      const orderAmount = Number(pendingOrder.selling_price);
      const smsAmount = Number(amount);
      const amountMatches = Math.abs(orderAmount - smsAmount) < 0.01;
      
      if (amountMatches) {
        console.log('✅ Found pending online order:', pendingOrder.id);
        
        await supabase
          .from('payment_receipts')
          .update({
            status: 'matched',
            matched_order_id: pendingOrder.id,
            matching_strategy: 'online_order_first',
            processed_at: new Date().toISOString(),
            admin_notes: `Auto-matched to online order ${pendingOrder.id} - ${pendingOrder.package_name} for ${pendingOrder.receiver_phone}`
          })
          .eq('id', receipt.id);

        await supabase
          .from('orders')
          .update({
            status: 'completed',
            delivery_status: 'queued'
          })
          .eq('id', pendingOrder.id);

        const { data: orderPackage } = await supabase
          .from('data_packages_config')
          .select('*, category_id')
          .eq('id', pendingOrder.package_id)
          .single();

        const { data: instruction } = await supabase
          .from('delivery_instructions')
          .select('*')
          .eq('provider_id', pendingOrder.provider_id)
          .eq('category_id', orderPackage?.category_id)
          .maybeSingle();

        if (instruction && orderPackage) {
          const normalizeProviderSlug = (name: string) => {
            const lower = name.toLowerCase();
            if (lower.includes('hormuud')) return 'hormuud';
            if (lower.includes('somnet')) return 'somnet';
            if (lower.includes('somtel')) return 'somtel';
            if (lower.includes('amtel')) return 'amtel';
            if (lower.includes('somlink')) return 'somlink';
            return lower.split(' ')[0];
          };

          const { data: providerData } = await supabase
            .from('providers_config')
            .select('provider_name')
            .eq('id', pendingOrder.provider_id)
            .single();

          const providerSlug = normalizeProviderSlug(providerData?.provider_name || '');

          // Try bundling first
          const bundled = await queueDeliveryWithBundling(supabase, pendingOrder.id, pendingOrder.package_id, pendingOrder.provider_id, pendingOrder.receiver_phone, providerSlug);
          
          if (!bundled) {
            const formatAmountForUssd = (amt: number) => {
              if (Number.isInteger(amt)) return amt.toString();
              const f = Number(amt).toFixed(2);
              if (amt < 1) return f.replace('.', '');
              return f.replace('.', '*');
            };
            const normalizePhoneForProvider = (phone: string) => {
              let p = (phone || '').replace(/^\+/, '');
              if (p.startsWith('252')) p = p.substring(3);
              return p.slice(-9);
            };
            const receiverForUssd = normalizePhoneForProvider(pendingOrder.receiver_phone);
            const _rate4 = await getProviderRate(supabase, pendingOrder.provider_id);
            const _topup4 = computeTopupAmount(Number(pendingOrder.selling_price ?? orderPackage.cost_price), _rate4);
            const costPriceFormatted = formatAmountForUssd(_topup4);
            const _pin4 = instruction.sim_password || '5516';
            const _method4 = await resolveUssdMethod(supabase, pendingOrder.provider_id, orderPackage.id, orderPackage.category_id);
            const ussdCode = _method4 ? buildUssdFromMethod(_method4, receiverForUssd, costPriceFormatted, _pin4) : instruction.code_template
              .replace('{receiver_phone}', receiverForUssd)
              .replace('{package_code}', orderPackage.ussd_code || '')
              .replace('{cost_price}', costPriceFormatted)
              .replace('{sim_password}', _pin4);

            const { error: queueError } = await supabase
              .from('delivery_queue')
              .insert({
                order_id: pendingOrder.id,
                provider_name: providerSlug,
                ussd_code: ussdCode,
                receiver_phone: pendingOrder.receiver_phone,
                package_code: orderPackage.ussd_code,
                status: 'pending',
                topup_amount: _topup4,
                pin_code: sanitizePin(_pin4),
              });
            if (queueError) console.error('❌ Queue error:', queueError);
            else console.log('📬 Online order queued for delivery');
          }
        } else {
          console.log('⚠️ No delivery instruction found for online order');
          await supabase
            .from('orders')
            .update({ 
              delivery_status: 'failed', 
              delivery_notes: 'No delivery instruction configured' 
            })
            .eq('id', pendingOrder.id);
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Online order matched and queued for delivery',
            order_id: pendingOrder.id,
            matching_strategy: 'online_order_first'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      } else {
        console.log('⚠️ Found pending order but amount mismatch:', { orderAmount, smsAmount });
      }
    }

    // PRIORITY 1.5 (REMOVED): broad_pending_match was removed because it matched
    // payments to ANY pending order with the same amount, regardless of sender.
    // This caused cross-customer payment misassignment.

    // ========================================
    // RACE CONDITION GUARD: SMS may arrive before client finished saving intent.
    // Wait 1.5s and re-check pending_online_payments before falling back to offline.
    // ========================================
    console.log('⏳ No pending intent found yet — waiting 1.5s for late intent (race guard)...');
    await new Promise(r => setTimeout(r, 1500));

    const { data: lateIntent } = await supabase
      .from('pending_online_payments')
      .select('*')
      .or(`sender_phone.in.(${senderVariants.map(v => `"${v}"`).join(',')}),verified_phone.in.(${senderVariants.map(v => `"${v}"`).join(',')})`)
      .eq('status', 'pending')
      .eq('expected_amount', amount)
      .gte('created_at', thirtyMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lateIntent) {
      console.log('✅ Late intent found after wait — re-routing to online matching:', lateIntent.id);
      // Lock + create order via same flow as PRIORITY 0
      const { data: relock } = await supabase
        .from('pending_online_payments')
        .update({ status: 'matched' })
        .eq('id', lateIntent.id)
        .eq('status', 'pending')
        .select('id');
      if (relock && relock.length > 0) {
        const { data: pkgD } = await supabase.from('data_packages_config').select('*, category_id').eq('id', lateIntent.package_id).single();
        const { data: provD } = await supabase.from('providers_config').select('provider_name').eq('id', lateIntent.provider_id).single();
        const { data: payProv } = await supabase.from('payment_providers_config').select('id').eq('is_active', true).order('created_at', { ascending: true }).limit(1).single();

        const { data: lateOrder, error: lateOrderErr } = await supabase.from('orders').insert({
          intent_id: lateIntent.id,
          customer_phone: normalizedSender,
          sender_phone: normalizedSender,
          receiver_phone: lateIntent.receiver_phone,
          provider_id: lateIntent.provider_id,
          package_id: lateIntent.package_id,
          package_name: pkgD?.package_name || 'Data Package',
          data_amount: pkgD?.data_amount || '',
          selling_price: amount,
          payment_provider_id: payProv?.id,
          payment_number: '617195659',
          payment_source: 'ussd_online_late',
          status: 'completed',
          delivery_status: 'queued',
        }).select().single();

        if (!lateOrderErr && lateOrder) {
          await supabase.from('payment_receipts').update({
            status: 'matched',
            matched_order_id: lateOrder.id,
            matching_strategy: 'pending_online_payment_late',
            processed_at: new Date().toISOString(),
            admin_notes: `Late intent recovered after race-condition wait | Receiver: ${lateIntent.receiver_phone}`,
          }).eq('id', receipt.id);

          // Queue delivery (single, no bundling for late path simplicity)
          const slug = (provD?.provider_name || '').toLowerCase().includes('hormuud') ? 'hormuud'
            : (provD?.provider_name || '').toLowerCase().includes('somnet') ? 'somnet'
            : (provD?.provider_name || '').toLowerCase().includes('somtel') ? 'somtel'
            : (provD?.provider_name || '').toLowerCase().includes('amtel') ? 'amtel'
            : (provD?.provider_name || '').toLowerCase().includes('somlink') ? 'somlink'
            : (provD?.provider_name || '').toLowerCase().split(' ')[0];

          let lateInstr: any = null;
          const { data: pi } = await supabase.from('delivery_instructions').select('code_template, sim_password').eq('provider_id', lateIntent.provider_id).eq('package_id', lateIntent.package_id).maybeSingle();
          if (pi?.code_template) lateInstr = pi;
          else if (pkgD?.category_id) {
            const { data: ci } = await supabase.from('delivery_instructions').select('code_template, sim_password').eq('provider_id', lateIntent.provider_id).eq('category_id', pkgD.category_id).is('package_id', null).maybeSingle();
            if (ci?.code_template) lateInstr = ci;
          }
          if (!lateInstr) {
            const { data: pri } = await supabase.from('delivery_instructions').select('code_template, sim_password').eq('provider_id', lateIntent.provider_id).is('category_id', null).is('package_id', null).maybeSingle();
            if (pri?.code_template) lateInstr = pri;
          }

          if (lateInstr?.code_template && pkgD) {
            const fmt = (a: number) => Number.isInteger(a) ? a.toString() : (a < 1 ? Number(a).toFixed(2).replace('.', '') : Number(a).toFixed(2).replace('.', '*'));
            const norm = (p: string) => { let d = (p||'').replace(/^\+/,''); if (d.startsWith('252')) d = d.substring(3); return d.slice(-9); };
            const _rate5 = await getProviderRate(supabase, lateIntent.provider_id);
            const _topup5 = computeTopupAmount(Number(lateIntent.expected_amount ?? pkgD.cost_price), _rate5);
            const _amt5 = fmt(_topup5);
            const _rcv5 = norm(lateIntent.receiver_phone);
            const _pin5 = lateInstr.sim_password || '5516';
            const _method5 = await resolveUssdMethod(supabase, lateIntent.provider_id, pkgD.id, pkgD.category_id);
            const ussd = _method5 ? buildUssdFromMethod(_method5, _rcv5, _amt5, _pin5) : lateInstr.code_template
              .replace('{receiver_phone}', _rcv5)
              .replace('{package_code}', pkgD.ussd_code || '')
              .replace('{cost_price}', _amt5)
              .replace('{sim_password}', _pin5);
            await supabase.from('delivery_queue').insert({
              order_id: lateOrder.id, provider_name: slug, ussd_code: ussd,
              receiver_phone: lateIntent.receiver_phone, package_code: pkgD.ussd_code, status: 'pending',
              topup_amount: _topup5,
              pin_code: sanitizePin(_pin5),
            });
          }

          return new Response(JSON.stringify({ success: true, message: 'Late intent matched after race wait', order_id: lateOrder.id, matching_strategy: 'pending_online_payment_late' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }
      }
    }

    // ========================================
    // PRIORITY 2: Fallback to offline_registrations
    // Match using ALL sender variants (9-digit, 0+9, 252+9, +252+9)
    // ========================================
    console.log('🔍 No pending online order found, checking offline registrations...');
    
    const { data: registration, error: registrationError } = await supabase
      .from('offline_registrations')
      .select('*')
      .in('sender_phone', senderVariants)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!registration) {
      console.log('❌ No registration found for sender:', normalizedSender, 'variants:', senderVariants);

      await supabase
        .from('payment_receipts')
        .update({
          status: 'unmatched',
          matching_strategy: 'no_intent_no_registration',
          admin_notes: `No online intent and no offline registration for sender ${normalizedSender} (original: ${sender_phone})`,
          processed_at: new Date().toISOString(),
        })
        .eq('id', receipt.id);

      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'No registration found for this sender'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Registration found:', {
      sender: registration.sender_phone,
      receiver: registration.receiver_phone,
      provider: registration.provider_name
    });

    // STEP 3: Find matching package by amount and provider
    const price = Number(amount);
    const min = Number((price - 0.005).toFixed(3));
    const max = Number((price + 0.005).toFixed(3));

    let { data: packages, error: packagesError } = await supabase
      .from('data_packages_config')
      .select('*')
      .eq('provider_id', registration.provider_id)
      .eq('selling_price', price)
      .eq('is_active', true);

    if (!packages || packages.length === 0) {
      const rangeRes = await supabase
        .from('data_packages_config')
        .select('*')
        .eq('provider_id', registration.provider_id)
        .eq('is_active', true)
        .gte('selling_price', min)
        .lte('selling_price', max)
        .order('selling_price', { ascending: true });
      packages = rangeRes.data ?? [];
      packagesError = rangeRes.error ?? packagesError;

      if (packages && packages.length > 0) {
        console.log('ℹ️ Using fuzzy price match:', { amount, matched: packages[0].selling_price });
      }
    }

    if (!packages || packages.length === 0) {
      console.log('❌ No package found for amount:', amount, 'on provider:', registration.provider_name);
      
      // Check if this amount matches a package on a DIFFERENT provider
      let crossProviderHint = '';
      const { data: otherPkgs } = await supabase
        .from('data_packages_config')
        .select('*, providers_config!inner(provider_name)')
        .eq('selling_price', price)
        .eq('is_active', true)
        .neq('provider_id', registration.provider_id)
        .limit(3);
      
      if (otherPkgs && otherPkgs.length > 0) {
        const otherProviders = [...new Set(otherPkgs.map((p: any) => p.providers_config?.provider_name))].join(', ');
        const pkgNames = otherPkgs.map((p: any) => p.package_name).join(', ');
        crossProviderHint = ` | ⚠️ Macmiilku wuxuu isdiiwaangeliyay ${registration.provider_name} laakiin $${amount} waa xirmo ${otherProviders} ah (${pkgNames}). Waxaa laga yaabaa in macmiilku provider-ka qaldan ku isdiiwaangeliyay.`;
        console.log('🔀 Cross-provider match found:', { registeredProvider: registration.provider_name, matchedProviders: otherProviders, packages: pkgNames });
      }
      
      await supabase
        .from('payment_receipts')
        .update({ 
          status: 'unmatched',
          admin_notes: `No package found for amount $${amount} on ${registration.provider_name}${crossProviderHint}`
        })
        .eq('id', receipt.id);

      return new Response(
        JSON.stringify({ 
          success: false, 
          message: `No package available for $${amount}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const selectedPackage = packages[0];
    console.log('📦 Package found:', selectedPackage.package_name);

    // STEP 4: Get default payment provider
    const { data: paymentProvider } = await supabase
      .from('payment_providers_config')
      .select('id')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    // STEP 5: Create order automatically
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_phone: normalizeSomaliPhone(registration.sender_phone),
        sender_phone: normalizeSomaliPhone(registration.sender_phone),
        receiver_phone: registration.receiver_phone,
        provider_id: registration.provider_id,
        package_id: selectedPackage.id,
        package_name: selectedPackage.package_name,
        data_amount: selectedPackage.data_amount,
        selling_price: amount,
        payment_provider_id: paymentProvider?.id,
        payment_number: '617195659',
        payment_source: 'sms_offline',
        status: 'completed',
        delivery_status: 'queued'
      })
      .select()
      .single();

    if (orderError) {
      console.error('❌ Order creation error:', orderError);
      throw orderError;
    }

    console.log('📝 Order created:', order.id);

    // STEP 6: Get delivery instructions
    const { data: instruction } = await supabase
      .from('delivery_instructions')
      .select('*')
      .eq('provider_id', registration.provider_id)
      .eq('category_id', selectedPackage.category_id)
      .maybeSingle();

    if (!instruction) {
      console.log('⚠️ No delivery instruction found');
      
      await supabase
        .from('orders')
        .update({ 
          delivery_status: 'failed', 
          delivery_notes: 'No delivery instruction configured' 
        })
        .eq('id', order.id);

      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Delivery instruction not configured'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // STEP 7: Normalize provider slug
    const normalizeProviderSlug = (name: string) => {
      const lower = name.toLowerCase();
      if (lower.includes('hormuud')) return 'hormuud';
      if (lower.includes('somnet')) return 'somnet';
      if (lower.includes('somtel')) return 'somtel';
      if (lower.includes('amtel')) return 'amtel';
      if (lower.includes('somlink')) return 'somlink';
      return lower.split(' ')[0];
    };
    const providerSlug = normalizeProviderSlug(registration.provider_name);

    // STEP 8: Try bundling first
    const bundled = await queueDeliveryWithBundling(supabase, order.id, selectedPackage.id, registration.provider_id, registration.receiver_phone, providerSlug);
    
    if (!bundled) {
      // Default single delivery
      const formatAmountForUssd = (amount: number) => {
        if (Number.isInteger(amount)) return amount.toString();
        const formatted = Number(amount).toFixed(2);
        return amount < 1 ? formatted.replace('.', '') : formatted.replace('.', '*');
      };
      const normalizePhoneForProvider = (phone: string) => {
        let p = (phone || '').replace(/^\+/, '');
        if (p.startsWith('252')) p = p.substring(3);
        return p.slice(-9);
      };
      const receiverForUssd = normalizePhoneForProvider(registration.receiver_phone);
      const _rate6 = await getProviderRate(supabase, selectedPackage.provider_id);
      // SMS-matched offline payment: use the actual paid amount (sender amount), not cost_price
      const _topup6 = computeTopupAmount(Number(amount ?? selectedPackage.cost_price), _rate6);
      const costPriceFormatted = formatAmountForUssd(_topup6);
      const _pin6 = instruction.sim_password || '5516';
      const _method6 = await resolveUssdMethod(supabase, selectedPackage.provider_id, selectedPackage.id, selectedPackage.category_id);
      const ussdCode = _method6 ? buildUssdFromMethod(_method6, receiverForUssd, costPriceFormatted, _pin6) : instruction.code_template
        .replace('{receiver_phone}', receiverForUssd)
        .replace('{package_code}', selectedPackage.ussd_code || '')
        .replace('{cost_price}', costPriceFormatted)
        .replace('{sim_password}', _pin6);

      const { error: queueError } = await supabase
        .from('delivery_queue')
        .insert({
          order_id: order.id,
          provider_name: providerSlug,
          ussd_code: ussdCode,
          receiver_phone: registration.receiver_phone,
          package_code: selectedPackage.ussd_code,
          status: 'pending',
          topup_amount: _topup6,
          pin_code: sanitizePin(_pin6),
        });
      if (queueError) { console.error('❌ Queue error:', queueError); throw queueError; }
      console.log('📬 Queued for delivery');
    }

    // STEP 10: Update payment receipt as matched
    await supabase
      .from('payment_receipts')
      .update({
        status: 'matched',
        matched_order_id: order.id,
        matching_strategy: 'offline_auto',
        processed_at: new Date().toISOString(),
        admin_notes: `Auto-matched to order ${order.id} - ${selectedPackage.package_name} for ${registration.receiver_phone}`
      })
      .eq('id', receipt.id);

    console.log('✅ Payment receipt matched');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Order created and queued for delivery',
        order_id: order.id,
        package_name: selectedPackage.package_name,
        receiver_phone: registration.receiver_phone
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('❌ Error processing payment:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
