import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fetches USSD delivery configuration for a provider by name.
async function fetchProviderUssdConfig(supabase: any, providerName: string | null | undefined) {
  if (!providerName) return { ussdMethod: null, ussdSingleTemplate: null, ussdFlowId: null };
  const { data } = await supabase
    .from('providers_config')
    .select('ussd_method, ussd_single_template, ussd_flow_id')
    .ilike('provider_name', providerName)
    .maybeSingle();
  return {
    ussdMethod: (data as any)?.ussd_method ?? null,
    ussdSingleTemplate: (data as any)?.ussd_single_template ?? null,
    ussdFlowId: (data as any)?.ussd_flow_id ?? null,
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();
    const action = url.searchParams.get('action');

    // Route: Get device SIM configuration (for dynamic SIM slot routing)
    if (req.method === 'GET' && (path === 'device-config' || action === 'device-config')) {
      const deviceId = url.searchParams.get('deviceId');
      
      if (!deviceId) {
        return new Response(
          JSON.stringify({ error: 'deviceId required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log('📱 Fetching SIM config for device:', deviceId);
      
      const { data: device, error } = await supabase
        .from('android_devices')
        .select('sim1_provider, sim2_provider')
        .eq('device_id', deviceId)
        .is('archived_at', null)
        .maybeSingle();
      
      if (error) {
        console.error('Device config fetch error:', error);
      }
      
      const config = {
        sim1Provider: device?.sim1_provider || null,
        sim2Provider: device?.sim2_provider || null
      };
      
      console.log('📱 SIM config response:', config);
      
      return new Response(
        JSON.stringify(config),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: Queue activation request
    if (req.method === 'POST' && path === 'activate-package') {
      const { orderId, providerName, receiverPhone } = await req.json();

      console.log('Queueing activation:', { orderId, providerName, receiverPhone });

      // Block check: reject if receiver phone is blocked
      const normalizedReceiver = receiverPhone?.replace(/\D/g, '').replace(/^252/, '').slice(-9) || '';
      const { data: isBlocked } = await supabase.rpc('is_phone_blocked', { p_phone: normalizedReceiver });
      if (isBlocked) {
        // Get block reason
        const { data: blockRecord } = await supabase
          .from('blocked_users')
          .select('reason')
          .eq('phone_number', normalizedReceiver)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        const blockReason = blockRecord?.reason || 'No reason provided';
        console.log('🚫 Blocked user attempted activation:', receiverPhone, 'Reason:', blockReason);

        // Update order if exists
        if (orderId) {
          await supabase.from('orders').update({
            delivery_status: 'blocked',
            delivery_notes: `Delivery denied: user blocked — ${blockReason}`,
          }).eq('id', orderId);
        }

        return new Response(
          JSON.stringify({ error: 'This phone number is blocked', blocked: true, reason: blockReason }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 1. Get order details to retrieve package_id
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select('package_id, provider_id')
        .eq('id', orderId)
        .single();

      if (orderErr || !order) {
        console.error('Order not found:', orderErr);
        throw new Error('Order not found');
      }

      // 2. Get package cost_price & category_id from database
      const { data: pkg, error: pkgErr } = await supabase
        .from('data_packages_config')
        .select('cost_price, category_id, ussd_method')
        .eq('id', order.package_id)
        .single();

      if (pkgErr || !pkg) {
        console.error('Package not found:', pkgErr);
        throw new Error('Package not found');
      }

      console.log('Package from DB:', { 
        packageId: order.package_id,
        costPrice: pkg.cost_price,
        categoryId: pkg.category_id 
      });

      // 3. Get delivery instruction template with priority: Package > Category > Provider default
      let instruction: { code_template: string | null; sim_password: string | null } | null = null;

      // First: Try package-specific instruction
      const { data: packageInstr } = await supabase
        .from('delivery_instructions')
        .select('code_template, sim_password')
        .eq('provider_id', order.provider_id)
        .eq('package_id', order.package_id)
        .maybeSingle();

      if (packageInstr?.code_template) {
        instruction = packageInstr;
        console.log('Using package-specific instruction for package:', order.package_id);
      } else if (pkg.category_id) {
        // Second: Try category-specific instruction (without package_id)
        const { data: categoryInstr } = await supabase
          .from('delivery_instructions')
          .select('code_template, sim_password')
          .eq('provider_id', order.provider_id)
          .eq('category_id', pkg.category_id)
          .is('package_id', null)
          .maybeSingle();

        if (categoryInstr?.code_template) {
          instruction = categoryInstr;
          console.log('Using category-specific instruction for category:', pkg.category_id);
        }
      }

      // Third: Fall back to provider default (no category, no package)
      if (!instruction) {
        const { data: providerInstr } = await supabase
          .from('delivery_instructions')
          .select('code_template, sim_password')
          .eq('provider_id', order.provider_id)
          .is('category_id', null)
          .is('package_id', null)
          .maybeSingle();

        if (providerInstr?.code_template) {
          instruction = providerInstr;
          console.log('Using provider default instruction');
        }
      }

      if (!instruction || !instruction.code_template) {
        console.error('No delivery instruction found for order:', orderId);
        throw new Error('Delivery instruction not configured for this package/category/provider');
      }

      // 4. Build final USSD code - format amount correctly
      const formatAmountForUssd = (amount: number) => {
        if (Number.isInteger(amount)) {
          return amount.toString();  // 20 -> "20"
        }
        const formatted = Number(amount).toFixed(2);
        if (amount < 1) {
          return formatted.replace('.', '');  // 0.10 -> "010", 0.09 -> "009"
        }
        return formatted.replace('.', '*');  // 4.25 -> "4*25"
      };

      // Normalize phone to 9 digits - remove 252 prefix (ALL providers reject 252!)
      const normalizePhoneForUssd = (phone: string): string => {
        let p = (phone || '').replace(/^\+/, '').replace(/\D/g, '');
        // Ka saar 252 prefix - shirkadaha DHAN wey diidayaan!
        if (p.startsWith('252')) {
          p = p.substring(3);
        }
        return p.slice(-9);
      };

      // Resolve provider rate and compute topup amount: user_amount × (1 + evoucher_rate)
      const { data: provRate } = await supabase
        .from('providers_config')
        .select('evoucher_rate, ussd_method')
        .eq('id', order.provider_id)
        .maybeSingle();
      const evoucherRate = Number(provRate?.evoucher_rate || 0);
      const userAmount = Number(order.selling_price ?? pkg.cost_price ?? 0);
      const topupAmount = Number((userAmount * (1 + evoucherRate)).toFixed(2));
      const costPriceFormatted = formatAmountForUssd(topupAmount);
      const receiverForUssd = normalizePhoneForUssd(receiverPhone);
      
      // Resolve USSD delivery method with priority: package > category > provider
      let resolvedUssdMethod: 'single_step' | 'interactive' | null = (pkg as any).ussd_method || null;
      if (!resolvedUssdMethod && pkg.category_id) {
        const { data: catRow } = await supabase.from('package_categories').select('ussd_method').eq('id', pkg.category_id).maybeSingle();
        resolvedUssdMethod = (catRow as any)?.ussd_method || null;
      }
      if (!resolvedUssdMethod) {
        resolvedUssdMethod = (provRate as any)?.ussd_method || null;
      }

      const pinForUssd = String(instruction.sim_password || '5516').trim().replace(/\D/g, '').slice(0, 4) || '5516';
      let finalUssd: string;
      if (resolvedUssdMethod === 'interactive') {
        finalUssd = `*725*${costPriceFormatted}*${receiverForUssd}#`;
      } else if (resolvedUssdMethod === 'single_step') {
        finalUssd = `*729*${receiverForUssd}*${costPriceFormatted}*${pinForUssd}#`;
      } else {
        // Fallback to legacy code_template
        finalUssd = instruction.code_template
          .replace('{receiver_phone}', receiverForUssd)
          .replace('{cost_price}', costPriceFormatted)
          .replace('{sim_password}', pinForUssd);
      }

      console.log('Final USSD constructed:', { resolvedUssdMethod, userAmount, evoucherRate, topupAmount, receiverForUssd, finalUssd });

      // 5. Idempotent insert into delivery_queue (avoid duplicates)
      let queueData: any = null;
      let queueError: any = null;

      const { data: existingQueue, error: existingErr } = await supabase
        .from('delivery_queue')
        .select('id, status')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingErr) {
        console.warn('Existing queue fetch error:', existingErr);
      }

      if (existingQueue && ['pending', 'processing', 'completed'].includes(existingQueue.status as string)) {
        queueData = existingQueue;
      } else {
        // Normalize provider name to slug format
        const normalizeProviderSlug = (name: string) => {
          const lower = name.toLowerCase();
          if (lower.includes('hormuud')) return 'hormuud';
          if (lower.includes('somnet')) return 'somnet';
          if (lower.includes('somtel')) return 'somtel';
          if (lower.includes('amtel')) return 'amtel';
          if (lower.includes('somlink')) return 'somlink';
          return lower.split(' ')[0];
        };

        const providerSlug = normalizeProviderSlug(providerName || '');

        // Find device with this provider and determine correct sim_slot
        const { data: deviceWithProvider } = await supabase
          .from('android_devices')
          .select('device_id, sim1_provider, sim2_provider')
          .is('archived_at', null)
          .or(`sim1_provider.ilike.%${providerSlug}%,sim2_provider.ilike.%${providerSlug}%`)
          .limit(1)
          .maybeSingle();

        // Calculate sim_slot: 0 = SIM1, 1 = SIM2
        let simSlot = 0;
        if (deviceWithProvider) {
          if (deviceWithProvider.sim1_provider?.toLowerCase().includes(providerSlug)) {
            simSlot = 0;
          } else if (deviceWithProvider.sim2_provider?.toLowerCase().includes(providerSlug)) {
            simSlot = 1;
          }
        }
        console.log('📱 Calculated sim_slot:', simSlot, 'for provider:', providerSlug);

        const insertRes = await supabase
          .from('delivery_queue')
          .insert({
            order_id: orderId,
            provider_name: providerSlug,
            ussd_code: finalUssd,
            receiver_phone: receiverPhone,
            status: 'pending',
            sim_slot: simSlot,
            topup_amount: topupAmount,
            pin_code: pinForUssd,
          })
          .select()
          .single();
        queueData = insertRes.data;
        queueError = insertRes.error;
      }

      if (queueError) {
        console.error('Queue insertion error:', queueError);
        throw queueError;
      }

      // 6. Update order status
      const { error: orderError } = await supabase
        .from('orders')
        .update({ delivery_status: 'queued' })
        .eq('id', orderId);

      if (orderError) {
        console.error('Order update error:', orderError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          queueId: queueData.id,
          estimatedTime: '10-30 seconds',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: Get pending orders (Android app polls this)
    if (req.method === 'GET' && path === 'pending') {
      const deviceId = url.searchParams.get('deviceId');
      const batteryParam = url.searchParams.get('battery');
      const chargingParam = url.searchParams.get('charging');

      console.log('Fetching pending orders for deviceId:', deviceId);

      // Update last_ping_at and battery_level from /pending call (duplicate-safe, no .maybeSingle())
      if (deviceId && batteryParam) {
        const pingUpdate: Record<string, unknown> = {
          last_ping_at: new Date().toISOString(),
          battery_level: parseInt(batteryParam),
        };
        const { data: pingRows } = await supabase
          .from('android_devices')
          .update(pingUpdate)
          .eq('device_id', deviceId)
          .is('archived_at', null)
          .select('id');
        if ((pingRows?.length ?? 0) > 1) {
          console.warn(`⚠️ /pending ping updated ${pingRows?.length} rows for device_id=${deviceId}`);
        }
        console.log(`🔋 Ping merged: device=${deviceId} battery=${batteryParam}% charging=${chargingParam}`);
      }

      // Look up device to get its configured providers (sim1_provider, sim2_provider)
      // Filter out archived devices to avoid duplicate conflicts
      const { data: device, error: deviceError } = await supabase
        .from('android_devices')
        .select('sim1_provider, sim2_provider')
        .eq('device_id', deviceId)
        .is('archived_at', null)
        .maybeSingle();

      if (deviceError) {
        console.error('Device lookup error:', deviceError);
      }

      // Build list of providers this device can handle
      const deviceProviders: string[] = [];
      if (device?.sim1_provider) {
        deviceProviders.push(device.sim1_provider.toLowerCase());
      }
      if (device?.sim2_provider) {
        deviceProviders.push(device.sim2_provider.toLowerCase());
      }

      console.log('Device providers:', deviceProviders);

      // If no device found or no providers configured, return empty
      if (deviceProviders.length === 0) {
        console.log('No providers configured for device:', deviceId);
        return new Response(
          JSON.stringify({ orders: [], nextPollMs: 20000 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Promote scheduled deliveries whose time has arrived
      await supabase
        .from('delivery_queue')
        .update({ status: 'pending' })
        .eq('status', 'scheduled')
        .lte('scheduled_at', new Date().toISOString());

      // ATOMIC CLAIM: Use RPC to claim one pending order (prevents race condition)
      const { data: claimed, error } = await supabase
        .rpc('claim_next_delivery', {
          p_device_id: deviceId,
          p_providers: deviceProviders
        });

      if (error) {
        console.error('Claim error:', error);
        throw error;
      }

      if (claimed && claimed.length > 0) {
        const order = claimed[0];
        
        console.log('✅ Claimed delivery:', { id: order.id, provider_name: order.provider_name });

        if (order.order_id) {
          const { data: orderQueues } = await supabase
            .from('delivery_queue')
            .select('status')
            .eq('order_id', order.order_id);

          const totalQueues = orderQueues?.length ?? 1;
          const completedQueues = orderQueues?.filter((row) => row.status === 'completed').length ?? 0;

          await supabase
            .from('orders')
            .update({
              delivery_status: 'processing',
              delivered_at: null,
              delivery_notes: totalQueues > 1
                ? `Bundle progress: ${completedQueues}/${totalQueues} delivered`
                : 'Package delivery in progress'
            })
            .eq('id', order.order_id);
        }

      const ussdCfg = await fetchProviderUssdConfig(supabase, order.provider_name);
      return new Response(
          JSON.stringify({
            orders: [{
              id: order.id,
              orderId: order.order_id,
              ussdCode: order.ussd_code,
              receiverPhone: order.receiver_phone,
              packageCode: order.package_code,
              attempts: order.attempts,
              simSlot: order.sim_slot ?? 0,
              provider: order.provider_name,
              pinCode: String(order.pin_code || '').trim().replace(/\D/g, '').slice(0, 4),
              topupAmount: order.topup_amount ?? null,
              ussdMethod: ussdCfg.ussdMethod,
              ussdSingleTemplate: ussdCfg.ussdSingleTemplate,
              ussdFlowId: ussdCfg.ussdFlowId,
            }],
            nextPollMs: 3000,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ orders: [], nextPollMs: 12000 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: Update delivery status (Android app reports back)
    if (req.method === 'POST' && path === 'status') {
      const { queueId, status, errorMessage, providerResponse } = await req.json();

      console.log('Updating delivery status:', { queueId, status, errorMessage });

      // Idempotency: if this queue already finalized, ignore further updates
      const { data: existingQueue, error: existingQueueErr } = await supabase
        .from('delivery_queue')
        .select('id, status, order_id, receiver_phone, package_code, created_at')
        .eq('id', queueId)
        .maybeSingle();
      if (existingQueueErr) {
        console.warn('Queue fetch error:', existingQueueErr);
      }
      if (!existingQueue) {
        return new Response(
          JSON.stringify({ success: false, message: 'Queue not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (['completed', 'failed', 'timeout'].includes(existingQueue.status as string)) {
        return new Response(
          JSON.stringify({ success: true, message: 'Already finalized' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Enhanced logging for debugging
      console.log('📊 Status update received:', { 
        queueId, 
        status, 
        errorMessage: errorMessage?.slice(0, 100),
        hasProviderResponse: !!providerResponse 
      });
      
      if (providerResponse) {
        console.log('🔍 Hormuud Response:', String(providerResponse).slice(0, 300));
      } else {
        console.log('⚠️  No provider response received from Android');
      }
      
      // Determine final status with provider response heuristics
      const text = String(providerResponse || '').toLowerCase();
      const successKeywords = [
        'ugu shubtay', 'u shubtay', 'ku guulaysatay', 'u wareejiso',
        'u dirto', 'haraagaagu waa', 'transcation id', 'transaction id',
        'e-voucher', 'jeeb', 'dhammays', 'abaal',
        'success', 'successful', 'completed', 'approved', 'confirmed', 'activated'
      ];
      const failureKeywords = [
        'khalad', 'error', 'failed', 'fail', 'rejected', 'insufficient',
        'invalid', 'denied', 'declined', 'cancelled', 'canceled',
        'service error', 'try again', 'please try again', 'internal',
        'temporarily', 'unavailable', 'not available', 'time out',
        'connection', 'network error', 'waxba kama dhicin'
      ];

      const providerIndicatesSuccess = text.length > 0 && successKeywords.some(k => text.includes(k));
      const providerIndicatesFailure = text.length > 0 && failureKeywords.some(k => text.includes(k));

      // Get current attempts for auto-retry logic
      const { data: existingQueue2, error: attemptsErr } = await supabase
        .from('delivery_queue')
        .select('attempts')
        .eq('id', queueId)
        .maybeSingle();
      if (attemptsErr) {
        console.warn('Attempts fetch error:', attemptsErr);
      }
      const currentAttempts = ((existingQueue2?.attempts as number | null) ?? 0);

      // STATUS PRIORITY:
      // 1. "Already activated" (horey u furtay) → RETRY every 60s up to max attempts; never auto-deliver
      // 2. "Already subscribed / dhammays" → completed (true duplicate package)
      // 3. Provider failure keywords → auto-retry or final fail
      // 4. Provider success keywords → completed (NEVER retry)
      // 5. Android status 'completed' → completed
      // 6. Timeout/failed → as reported
      let normalizedStatus = 'failed';
      let autoRetryTriggered = false;
      let alreadyActiveRetry = false;

      // "Already activated" — keep retrying every 60s until response changes
      const alreadyActive = (
        (text.includes('horey') && text.includes('furtay')) ||
        text.includes('already activated') ||
        text.includes('already active') ||
        text.includes('mar hore')
      );

      // True "already subscribed" — receiver already has THIS exact package → delivered
      const alreadySubscribed = !alreadyActive && (
        text.includes('dhammays') ||
        text.includes('already subscribed') ||
        text.includes('currently subscribed')
      );

      const MAX_ALREADY_ACTIVE_ATTEMPTS = 5;

      if (alreadySubscribed) {
        console.log(`✅ "Already subscribed" detected — marking delivered (NO retry). Text: ${text.slice(0, 120)}`);

        await supabase
          .from('delivery_queue')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            error_message: 'Auto-resolved: receiver already subscribed (no retry)',
            provider_response: providerResponse || undefined,
          })
          .eq('id', queueId);

        if (existingQueue.order_id) {
          await supabase.rpc('mark_order_already_subscribed', {
            p_order_id: existingQueue.order_id,
            p_response_text: text.slice(0, 200),
          });
        }

        return new Response(
          JSON.stringify({ success: true, message: 'Auto-resolved as delivered (already subscribed)' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else if (alreadyActive) {
        // UNLIMITED RETRIES every 60s — never stop until provider response changes
        console.log(`🔁 "Horey u furtay" — unlimited retry in 60s (attempt ${currentAttempts + 1}). Text: ${text.slice(0, 120)}`);
        normalizedStatus = 'pending';
        autoRetryTriggered = true;
        alreadyActiveRetry = true;
      } else if (providerIndicatesFailure && !providerIndicatesSuccess) {
        console.log('🔄 Provider indicates FAILURE:', text.slice(0, 100));
        if (currentAttempts < 2) {
          normalizedStatus = 'pending';
          autoRetryTriggered = true;
          console.log(`🔄 Auto-retry triggered: attempt ${currentAttempts + 1}/3, cooldown 15s`);
        } else {
          normalizedStatus = 'failed';
          console.log(`❌ Max retries reached (${currentAttempts + 1}/3) - FINAL FAIL`);
        }
      } else if (providerIndicatesSuccess) {
        normalizedStatus = 'completed';
        console.log('✅ Provider indicates SUCCESS - marking completed (no retry ever)');
      } else if (status === 'completed') {
        normalizedStatus = 'completed';
      } else if (status === 'pending') {
        normalizedStatus = 'pending';
        autoRetryTriggered = true;
        console.log('🔁 Android requested background retry - returning queue to pending with cooldown.');
      } else if (status === 'timeout') {
        normalizedStatus = 'timeout';
        console.log('⏱️ Status TIMEOUT: USSD sent but no provider response. Needs manual verification.');
      } else if (status === 'failed') {
        normalizedStatus = 'failed';
      }

      // Prepare update data
      const updateData: any = {
        status: normalizedStatus,
        last_attempt_at: new Date().toISOString(),
        attempts: currentAttempts + 1,
      };

      // Save provider response
      if (providerResponse) {
        updateData.provider_response = providerResponse;
      }

      if (normalizedStatus === 'completed') {
        updateData.completed_at = new Date().toISOString();
      }

      // Auto-retry: set scheduled_at and clear device assignment
      if (autoRetryTriggered) {
        const cooldownMs = alreadyActiveRetry ? 60_000 : 15_000;
        const retryAt = new Date(Date.now() + cooldownMs).toISOString();
        updateData.scheduled_at = retryAt;
        updateData.android_device_id = null;
        updateData.error_message = alreadyActiveRetry
          ? `Xirmadu wali waa firfircoon — 1 daqiiqo ka dib ayaa dib loo isku dayi (#${currentAttempts + 1})`
          : `Auto-retry ${currentAttempts + 1}/3: ${providerResponse || errorMessage || 'Provider error'}`;
        console.log(`⏰ Scheduled retry at ${retryAt} (cooldown: ${cooldownMs / 1000}s)`);
      } else if (errorMessage) {
        updateData.error_message = errorMessage;
      }

      // Update delivery queue
      const { data: queueData, error: queueError } = await supabase
        .from('delivery_queue')
        .update(updateData)
        .eq('id', queueId)
        .select()
        .single();

      if (queueError) {
        console.error('Queue update error:', queueError);
        throw queueError;
      }

      if (queueData.order_id) {
        const { data: orderQueues, error: orderQueuesError } = await supabase
          .from('delivery_queue')
          .select('id, status, provider_response, error_message')
          .eq('order_id', queueData.order_id)
          .order('created_at', { ascending: true });

        if (orderQueuesError) {
          console.warn('Order queues fetch error:', orderQueuesError);
        }

        const siblingQueues = orderQueues && orderQueues.length > 0 ? orderQueues : [queueData];
        const totalQueues = siblingQueues.length;
        const completedQueues = siblingQueues.filter((row) => row.status === 'completed');
        const hasInFlightQueue = siblingQueues.some((row) => ['pending', 'processing', 'scheduled'].includes(row.status ?? ''));
        const hasTimeoutQueue = siblingQueues.some((row) => row.status === 'timeout');
        const hasFailedQueue = siblingQueues.some((row) => row.status === 'failed');
        const allCancelled = totalQueues > 0 && siblingQueues.every((row) => row.status === 'cancelled');
        const allCompleted = totalQueues > 0 && completedQueues.length === totalQueues;
        const latestMessage = queueData.provider_response || queueData.error_message || providerResponse || errorMessage || null;

        const orderUpdate: any = {
          delivered_at: null,
        };

        if (allCompleted) {
          orderUpdate.delivery_status = 'delivered';
          orderUpdate.delivered_at = new Date().toISOString();
          orderUpdate.delivery_notes = totalQueues > 1
            ? `Bundle delivered: ${completedQueues.length}/${totalQueues} targets completed`
            : latestMessage || 'Package activated successfully';
        } else if (allCancelled) {
          orderUpdate.delivery_status = 'cancelled';
          orderUpdate.delivery_notes = latestMessage || 'Bundle delivery cancelled';
        } else if (hasInFlightQueue) {
          orderUpdate.delivery_status = 'processing';
          if (autoRetryTriggered) {
            orderUpdate.delivery_notes = totalQueues > 1
              ? `Bundle progress: ${completedQueues.length}/${totalQueues} delivered — retry scheduled`
              : `Auto-retry ${currentAttempts + 1}/3: ${providerResponse || 'Provider error, retrying...'}`;
          } else {
            orderUpdate.delivery_notes = totalQueues > 1
              ? `Bundle progress: ${completedQueues.length}/${totalQueues} delivered`
              : 'Package delivery in progress';
          }
        } else if (hasTimeoutQueue) {
          orderUpdate.delivery_status = 'timeout';
          orderUpdate.delivery_notes = totalQueues > 1
            ? `Bundle incomplete: ${completedQueues.length}/${totalQueues} delivered, one target timed out`
            : latestMessage || 'USSD dialed but no provider response captured. Needs manual verification.';
        } else if (hasFailedQueue) {
          orderUpdate.delivery_status = 'failed';
          orderUpdate.delivery_notes = totalQueues > 1
            ? `Bundle failed: ${completedQueues.length}/${totalQueues} delivered successfully`
            : latestMessage || 'Activation failed';
        } else {
          orderUpdate.delivery_status = normalizedStatus === 'completed' ? 'delivered' : 'processing';
          orderUpdate.delivery_notes = latestMessage || 'Package delivery updated';
        }

        await supabase
          .from('orders')
          .update(orderUpdate)
          .eq('id', queueData.order_id);
      }

      // Update device counters
      if (queueData.android_device_id) {
        const { data: device, error: devErr } = await supabase
          .from('android_devices')
          .select('id, total_deliveries, failed_deliveries, device_id')
          .eq('device_id', queueData.android_device_id)
          .is('archived_at', null)
          .maybeSingle();
        if (devErr) {
          console.warn('Device fetch error:', devErr);
        } else if (device) {
          const updates: any = {};
          if (normalizedStatus === 'completed') {
            updates.total_deliveries = ((device.total_deliveries as number | null) ?? 0) + 1;
          } else {
            updates.failed_deliveries = ((device.failed_deliveries as number | null) ?? 0) + 1;
          }
          await supabase
            .from('android_devices')
            .update(updates)
            .eq('id', device.id);
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: Device heartbeat
    if (req.method === 'POST' && path === 'ping') {
      const { deviceId, batteryLevel, isCharging, queueSize } = await req.json();

      // Update ALL non-archived rows for this device_id (duplicate-safe)
      const pingData = { 
        last_ping_at: new Date().toISOString(),
        battery_level: typeof batteryLevel === 'number' ? batteryLevel : null
      };
      const { data: updatedRows, error: updateErr } = await supabase
        .from('android_devices')
        .update(pingData)
        .eq('device_id', deviceId)
        .is('archived_at', null)
        .select('id');

      if (updateErr) {
        console.error('Ping update error:', updateErr);
      }

      const rowCount = updatedRows?.length ?? 0;
      if (rowCount > 1) {
        console.warn(`⚠️ Ping updated ${rowCount} rows for device_id=${deviceId} — duplicate rows exist!`);
      }

      // If device doesn't exist (0 rows updated), auto-register it
      if (rowCount === 0 && !updateErr) {
        console.log('📱 New device detected, auto-registering:', deviceId);
        const { data: insertedDevice, error: insertErr } = await supabase
          .from('android_devices')
          .insert({
            device_id: deviceId,
            device_name: `Auto-registered ${new Date().toISOString().split('T')[0]}`,
            provider_name: 'Unknown',
            sim_number: 'Unknown',
            is_active: true,
            last_ping_at: new Date().toISOString()
          })
          .select()
          .single();
        
        if (insertErr) {
          console.error('Auto-register error:', insertErr);
        } else {
          console.log('✅ Device auto-registered successfully:', deviceId);
          
          // Auto-create default sim_balances for new device
          const { error: balanceErr } = await supabase
            .from('sim_balances')
            .insert([
              { sim_id: insertedDevice.id, balance: 0, balance_type: 'evc_plus', balance_source: 'manual' },
              { sim_id: insertedDevice.id, balance: 0, balance_type: 'evoucher', balance_source: 'manual' }
            ]);
          
          if (balanceErr) {
            console.error('Auto-create balances error:', balanceErr);
          } else {
            console.log('✅ Created default sim_balances for new device');
          }
        }
      }

      // Sweep stuck 'processing' deliveries for this device (timeout 120s)
      try {
        const timeoutMs = 300000; // 5 minutes - allows more time for slow networks
        const now = Date.now();
        const { data: processingRows, error: procErr } = await supabase
          .from('delivery_queue')
          .select('id, order_id, last_attempt_at, created_at, attempts')
          .eq('status', 'processing')
          .eq('android_device_id', deviceId);

        if (procErr) {
          console.warn('Processing fetch error:', procErr);
        } else {
          for (const row of processingRows ?? []) {
            const last = row.last_attempt_at ? new Date(row.last_attempt_at as string).getTime() : 0;
            const created = row.created_at ? new Date(row.created_at as string).getTime() : 0;
            const age = Math.max(now - last, now - created);
            if (age > timeoutMs) {
              console.log(`Timeout reaping queueId=${row.id} (age=${age}ms)`);
              const newAttempts = ((row.attempts as number | null) ?? 0) + 1;
              const { data: updated, error: updErr } = await supabase
                .from('delivery_queue')
                .update({
                  status: 'timeout',
                  error_message: 'Device timeout: awaiting manual verification',
                  last_attempt_at: new Date().toISOString(),
                  attempts: newAttempts,
                })
                .eq('id', row.id as string)
                .select()
                .single();
              if (updErr) {
                console.error('Timeout update error:', updErr);
              } else if (updated) {
                await supabase
                  .from('orders')
                  .update({
                    delivery_status: 'timeout',
                    delivery_notes: 'Device timeout: USSD sent but no callback. Verify customer received bundle.',
                  })
                  .eq('id', updated.order_id as string);
              }
            }
          }
        }
      } catch (e) {
        console.warn('Ping sweep error:', e);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==================== OTP SMS ROUTES ====================
    
    // Route: Get pending OTP tasks for Android device (filtered by provider)
    if (req.method === 'GET' && path === 'otp-pending') {
      const deviceId = url.searchParams.get('deviceId');
      
      console.log('📱 Fetching pending OTP tasks for device:', deviceId);

      // Get device's configured providers (sim1_provider, sim2_provider)
      const { data: device, error: deviceError } = await supabase
        .from('android_devices')
        .select('sim1_provider, sim2_provider')
        .eq('device_id', deviceId)
        .is('archived_at', null)
        .maybeSingle();

      if (deviceError) {
        console.error('Device lookup error:', deviceError);
      }

      // Build list of providers this device can handle
      const deviceProviders: string[] = [];
      if (device?.sim1_provider) {
        deviceProviders.push(device.sim1_provider.toLowerCase());
      }
      if (device?.sim2_provider) {
        deviceProviders.push(device.sim2_provider.toLowerCase());
      }

      console.log('📱 Device providers for OTP:', deviceProviders);

      // If no providers configured, return empty
      if (deviceProviders.length === 0) {
        console.log('No providers configured for device:', deviceId);
        return new Response(
          JSON.stringify({ tasks: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get pending OTP tasks matching device's providers (oldest first, limit 5)
      const { data: tasks, error } = await supabase
        .from('sms_otp_queue')
        .select('id, phone_number, otp_code, provider')
        .eq('status', 'pending')
        .in('provider', deviceProviders)
        .order('created_at', { ascending: true })
        .limit(5);

      if (error) {
        console.error('OTP fetch error:', error);
        throw error;
      }

      // Mark fetched tasks as processing
      if (tasks && tasks.length > 0) {
        const taskIds = tasks.map(t => t.id);
        await supabase
          .from('sms_otp_queue')
          .update({ 
            status: 'processing',
            device_id: deviceId 
          })
          .in('id', taskIds);
        
        console.log(`✅ Found ${tasks.length} pending OTP tasks for providers:`, deviceProviders);
      } else {
        console.log('📭 No pending OTP tasks for providers:', deviceProviders);
      }

      return new Response(
        JSON.stringify({ 
          tasks: tasks?.map(t => ({
            id: t.id,
            phoneNumber: t.phone_number,
            otpCode: t.otp_code,
            provider: t.provider
          })) || []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: Update OTP task status
    if (req.method === 'POST' && path === 'otp-status') {
      const { taskId, status, errorMessage } = await req.json();

      console.log('📱 Updating OTP status:', { taskId, status });

      const updateData: any = {
        status: status,
        processed_at: new Date().toISOString()
      };

      if (errorMessage) {
        updateData.error_message = errorMessage;
      }

      const { error } = await supabase
        .from('sms_otp_queue')
        .update(updateData)
        .eq('id', taskId);

      if (error) {
        console.error('OTP status update error:', error);
        throw error;
      }

      console.log(`✅ OTP task ${taskId} marked as ${status}`);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==================== COMBINED POLL ROUTE ====================
    // Combines /pending + /ping + /otp-pending into a single call to reduce Edge Function invocations
    if (req.method === 'POST' && path === 'poll') {
      const { deviceId, batteryLevel } = await req.json();
      
      if (!deviceId) {
        return new Response(
          JSON.stringify({ error: 'deviceId required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 1. Ping / heartbeat — duplicate-safe (update all non-archived rows)
      const { data: updatedRows } = await supabase
        .from('android_devices')
        .update({ 
          last_ping_at: new Date().toISOString(),
          battery_level: typeof batteryLevel === 'number' ? batteryLevel : null
        })
        .eq('device_id', deviceId)
        .is('archived_at', null)
        .select('sim1_provider, sim2_provider');

      if ((updatedRows?.length ?? 0) > 1) {
        console.warn(`⚠️ /poll ping updated ${updatedRows?.length} rows for device_id=${deviceId}`);
      }

      const updatedDevice = updatedRows?.[0] ?? null;

      // Auto-register if not found
      if (!updatedDevice) {
        const { data: insertedDevice } = await supabase
          .from('android_devices')
          .insert({
            device_id: deviceId,
            device_name: `Auto-registered ${new Date().toISOString().split('T')[0]}`,
            provider_name: 'Unknown',
            sim_number: 'Unknown',
            is_active: true,
            last_ping_at: new Date().toISOString()
          })
          .select('id, sim1_provider, sim2_provider')
          .single();
        
        if (insertedDevice) {
          await supabase.from('sim_balances').insert([
            { sim_id: insertedDevice.id, balance: 0, balance_type: 'evc_plus', balance_source: 'manual' },
            { sim_id: insertedDevice.id, balance: 0, balance_type: 'evoucher', balance_source: 'manual' }
          ]);
        }
      }

      const device = updatedDevice || { sim1_provider: null, sim2_provider: null };
      const deviceProviders: string[] = [];
      if (device.sim1_provider) deviceProviders.push(device.sim1_provider.toLowerCase());
      if (device.sim2_provider) deviceProviders.push(device.sim2_provider.toLowerCase());

      let deliveryOrder = null;
      let otpTasks: any[] = [];

      if (deviceProviders.length > 0) {
        // Promote scheduled deliveries whose time has arrived
        await supabase
          .from('delivery_queue')
          .update({ status: 'pending' })
          .eq('status', 'scheduled')
          .lte('scheduled_at', new Date().toISOString());

        // 2. ATOMIC CLAIM: Pending delivery (prevents race condition)
        const { data: claimed } = await supabase
          .rpc('claim_next_delivery', {
            p_device_id: deviceId,
            p_providers: deviceProviders
          });

        if (claimed && claimed.length > 0) {
          const order = claimed[0];
          const ussdCfg = await fetchProviderUssdConfig(supabase, order.provider_name);
          deliveryOrder = {
            id: order.id,
            orderId: order.order_id,
            ussdCode: order.ussd_code,
            receiverPhone: order.receiver_phone,
            packageCode: order.package_code,
            attempts: order.attempts,
            simSlot: order.sim_slot ?? 0,
            provider: order.provider_name,
            topupAmount: order.topup_amount ?? null,
            ussdMethod: ussdCfg.ussdMethod,
            ussdSingleTemplate: ussdCfg.ussdSingleTemplate,
            ussdFlowId: ussdCfg.ussdFlowId,
          };
        }

        // 3. OTP tasks removed - OTP is now shown on-screen, no SMS needed
      }

      // 4. Sweep stuck processing deliveries (timeout 5min)
      try {
        const timeoutMs = 300000;
        const now = Date.now();
        const { data: processingRows } = await supabase
          .from('delivery_queue')
          .select('id, order_id, last_attempt_at, created_at, attempts')
          .eq('status', 'processing')
          .eq('android_device_id', deviceId);

        for (const row of processingRows ?? []) {
          const last = row.last_attempt_at ? new Date(row.last_attempt_at as string).getTime() : 0;
          const created = row.created_at ? new Date(row.created_at as string).getTime() : 0;
          const age = Math.max(now - last, now - created);
          if (age > timeoutMs) {
            const newAttempts = ((row.attempts as number | null) ?? 0) + 1;
            const { data: updated } = await supabase
              .from('delivery_queue')
              .update({ status: 'timeout', error_message: 'Device timeout', last_attempt_at: new Date().toISOString(), attempts: newAttempts })
              .eq('id', row.id as string)
              .select()
              .single();
            if (updated) {
              await supabase.from('orders').update({ delivery_status: 'timeout', delivery_notes: 'Device timeout: verify customer received bundle.' }).eq('id', updated.order_id as string);
            }
          }
        }
      } catch (_e) { /* sweep error, non-critical */ }

      // Dynamic poll interval: 3s when busy, 10s when idle
      const hasPendingWork = deliveryOrder !== null;
      const nextPollMs = hasPendingWork ? 3000 : 10000;

      return new Response(
        JSON.stringify({
          success: true,
          orders: deliveryOrder ? [deliveryOrder] : [],
          tasks: [],
          nextPollMs,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Route not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
