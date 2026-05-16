// WaafiPay HPS - Mobile Wallet (EVC Plus) USTPB Payment for iOS users
// Server creates the order + delivery_queue immediately on success.
// Idempotency: orders.intent_id UNIQUE prevents duplicates.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PaymentRequest {
  senderPhone: string;
  receiverPhone: string;
  amount: number;
  packageId: string;
  providerId: string;
  paymentProviderId?: string;
  packageName?: string;
  dataAmount?: string;
  description?: string;
  intentId: string; // REQUIRED — from create_online_payment_reservation
}

function normalizePhone(phone: string): string {
  let digits = (phone || "").replace(/\D/g, "");
  if (digits.startsWith("252") && digits.length >= 12) digits = digits.substring(3);
  if (digits.startsWith("0") && digits.length === 10) digits = digits.substring(1);
  return digits.slice(-9);
}

function fmtAmt(a: number) {
  if (Number.isInteger(a)) return a.toString();
  const f = Number(a).toFixed(2);
  return a < 1 ? f.replace(".", "") : f.replace(".", "*");
}

function providerSlug(name: string) {
  const l = (name || "").toLowerCase();
  if (l.includes("hormuud")) return "hormuud";
  if (l.includes("somnet")) return "somnet";
  if (l.includes("somtel")) return "somtel";
  if (l.includes("amtel")) return "amtel";
  if (l.includes("somlink")) return "somlink";
  return l.split(" ")[0] || "hormuud";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Support both WAAFIPAY_ and WAAFI_ secret prefixes
    const WAAFI_API_URL = Deno.env.get("WAAFIPAY_API_URL") || Deno.env.get("WAAFI_API_URL");
    const WAAFI_MERCHANT_UID = Deno.env.get("WAAFIPAY_MERCHANT_UID") || Deno.env.get("WAAFI_MERCHANT_UID");
    const WAAFI_API_USER_ID = Deno.env.get("WAAFIPAY_API_USER_ID") || Deno.env.get("WAAFI_API_USER_ID");
    const WAAFI_API_KEY = Deno.env.get("WAAFIPAY_API_KEY") || Deno.env.get("WAAFI_API_KEY");

    if (!WAAFI_API_URL || !WAAFI_MERCHANT_UID || !WAAFI_API_USER_ID || !WAAFI_API_KEY) {
      console.error("Missing WaafiPay credentials");
      return new Response(
        JSON.stringify({ success: false, error: "WaafiPay credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: PaymentRequest = await req.json();
    if (!body || typeof body.amount !== "number" || body.amount <= 0 || !body.senderPhone || !body.receiverPhone || !body.packageId || !body.providerId || !body.intentId) {
      return new Response(
        JSON.stringify({ success: false, error: "invalid_request: amount, senderPhone, receiverPhone, packageId, providerId, intentId required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sender = normalizePhone(body.senderPhone);
    const receiver = normalizePhone(body.receiverPhone);
    if (sender.length !== 9) {
      return new Response(
        JSON.stringify({ success: false, error: "Sender phone must be valid 9-digit Somali number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // ============ IDEMPOTENCY: check if order already exists for this intent ============
    const { data: existing } = await supabase
      .from("orders")
      .select("id, status, delivery_status")
      .eq("intent_id", body.intentId)
      .maybeSingle();

    if (existing) {
      console.log("✅ Order already exists for intent (idempotent):", existing.id);
      return new Response(
        JSON.stringify({ success: true, orderId: existing.id, idempotent: true, message: "Order already created" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ Call WaafiPay HPS API ============
    const referenceId = body.intentId;
    const payload = {
      schemaVersion: "1.0",
      requestId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      channelName: "WEB",
      serviceName: "API_PURCHASE",
      serviceParams: {
        merchantUid: WAAFI_MERCHANT_UID,
        apiUserId: WAAFI_API_USER_ID,
        apiKey: WAAFI_API_KEY,
        paymentMethod: "MWALLET_ACCOUNT",
        payerInfo: { accountNo: `252${sender}` },
        transactionInfo: {
          referenceId,
          invoiceId: referenceId,
          amount: body.amount.toFixed(2),
          currency: "USD",
          description: body.description || "Iftin Internet Data Purchase",
        },
      },
    };

    console.log("📤 WaafiPay request:", { intentId: body.intentId, amount: body.amount, phone: `252${sender}` });

    const upstream = await fetch(WAAFI_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await upstream.json().catch(() => ({} as any));
    console.log("📥 WaafiPay response:", JSON.stringify(result));

    const respCode = result?.responseCode || result?.params?.state || "";
    const respMsg = result?.responseMsg || result?.params?.responseMsg || "Unknown";
    const txId = result?.params?.transactionId || result?.params?.referenceId || referenceId;
    const isSuccess = String(respCode) === "2001" || String(result?.params?.state).toUpperCase() === "APPROVED";

    if (!isSuccess) {
      // Mark intent as failed so user can retry cleanly
      await supabase.from("pending_online_payments").update({ status: "failed" }).eq("id", body.intentId).eq("status", "pending");
      return new Response(
        JSON.stringify({ success: false, error: respMsg || "Lacag bixintu way fashilantay", responseCode: respCode }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ Server-side: lock intent, create order + delivery_queue ============
    const { data: lockResult } = await supabase
      .from("pending_online_payments")
      .update({ status: "matched" })
      .eq("id", body.intentId)
      .eq("status", "pending")
      .select("id");

    if (!lockResult || lockResult.length === 0) {
      // Already matched (concurrent SMS already created it) — re-fetch and return
      const { data: existing2 } = await supabase
        .from("orders").select("id").eq("intent_id", body.intentId).maybeSingle();
      if (existing2) {
        return new Response(JSON.stringify({ success: true, orderId: existing2.id, idempotent: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Fetch package + provider info
    const [{ data: pkg }, { data: provider }, { data: paymentProv }] = await Promise.all([
      supabase.from("data_packages_config").select("*").eq("id", body.packageId).single(),
      supabase.from("providers_config").select("provider_name").eq("id", body.providerId).single(),
      body.paymentProviderId
        ? supabase.from("payment_providers_config").select("id").eq("id", body.paymentProviderId).maybeSingle()
        : supabase.from("payment_providers_config").select("id").eq("is_active", true).order("created_at", { ascending: true }).limit(1).maybeSingle(),
    ]);

    if (!pkg || !provider) {
      return new Response(JSON.stringify({ success: false, error: "Package or provider not found" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Insert order with intent_id (UNIQUE → hard idempotency)
    const { data: newOrder, error: orderErr } = await supabase
      .from("orders")
      .insert({
        intent_id: body.intentId,
        customer_phone: sender,
        sender_phone: sender,
        receiver_phone: receiver,
        provider_id: body.providerId,
        package_id: body.packageId,
        package_name: pkg.package_name,
        data_amount: pkg.data_amount,
        selling_price: body.amount,
        payment_provider_id: paymentProv?.id,
        payment_number: sender,
        payment_source: "waafipay_api",
        status: "completed",
        delivery_status: "queued",
      })
      .select()
      .single();

    if (orderErr) {
      // 23505 = unique violation → another request already created it
      if (orderErr.code === "23505") {
        const { data: existing3 } = await supabase
          .from("orders").select("id").eq("intent_id", body.intentId).single();
        return new Response(JSON.stringify({ success: true, orderId: existing3?.id, idempotent: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      console.error("❌ Order insert error:", orderErr);
      throw orderErr;
    }

    // Build delivery_queue entry (single, no bundling for v1 — bundling can be added later)
    let instruction: any = null;
    const { data: pkgI } = await supabase.from("delivery_instructions").select("code_template, sim_password")
      .eq("provider_id", body.providerId).eq("package_id", body.packageId).maybeSingle();
    if (pkgI?.code_template) instruction = pkgI;
    else if (pkg.category_id) {
      const { data: catI } = await supabase.from("delivery_instructions").select("code_template, sim_password")
        .eq("provider_id", body.providerId).eq("category_id", pkg.category_id).is("package_id", null).maybeSingle();
      if (catI?.code_template) instruction = catI;
    }
    if (!instruction) {
      const { data: provI } = await supabase.from("delivery_instructions").select("code_template, sim_password")
        .eq("provider_id", body.providerId).is("category_id", null).is("package_id", null).maybeSingle();
      if (provI?.code_template) instruction = provI;
    }

    const slug = providerSlug(provider.provider_name);

    if (instruction?.code_template) {
      const ussd = instruction.code_template
        .replace("{receiver_phone}", receiver)
        .replace("{package_code}", pkg.ussd_code || "")
        .replace("{cost_price}", fmtAmt(Number(pkg.cost_price)))
        .replace("{sim_password}", instruction.sim_password || "5516");

      const { error: qErr } = await supabase.from("delivery_queue").insert({
        order_id: newOrder.id,
        provider_name: slug,
        ussd_code: ussd,
        receiver_phone: receiver,
        package_code: pkg.ussd_code,
        status: "pending",
      });
      if (qErr) console.error("❌ Queue insert error:", qErr);
      else console.log("📬 Delivery queued for order", newOrder.id);
    } else {
      console.warn("⚠️ No delivery instruction; marking order failed");
      await supabase.from("orders").update({
        delivery_status: "failed",
        delivery_notes: "No delivery instruction configured",
      }).eq("id", newOrder.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        orderId: newOrder.id,
        transactionId: txId,
        responseCode: respCode,
        message: respMsg,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("waafipay-payment error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
