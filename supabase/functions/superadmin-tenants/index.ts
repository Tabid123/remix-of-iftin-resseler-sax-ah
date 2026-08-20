import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
    if (!caller) throw new Error("Not authenticated");

    const { data: isSuper } = await supabaseAdmin.rpc("is_super_admin", { _user_id: caller.id });
    if (!isSuper) throw new Error("Not authorized");

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body.action ?? "list";

    if (action === "update") {
      const { tenant_id, plan, status } = body;
      if (!tenant_id) throw new Error("tenant_id required");
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (plan) patch.plan = plan;
      if (status) patch.status = status;
      const { error } = await supabaseAdmin.from("tenants").update(patch).eq("id", tenant_id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tenants, error: tErr } = await supabaseAdmin
      .from("tenants")
      .select("id, name, slug, plan, status, logo_url, primary_color, secondary_color, owner_id, created_at")
      .order("created_at", { ascending: false });
    if (tErr) throw tErr;

    const { data: members } = await supabaseAdmin
      .from("tenant_members")
      .select("tenant_id, user_id, role");

    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("tenant_id, selling_price, delivery_status");

    const counts: Record<string, { members: number; orders: number; revenue: number }> = {};
    for (const t of tenants ?? []) counts[t.id] = { members: 0, orders: 0, revenue: 0 };
    for (const m of members ?? []) {
      if (m.tenant_id && counts[m.tenant_id]) counts[m.tenant_id].members += 1;
    }
    for (const o of orders ?? []) {
      if (!o.tenant_id || !counts[o.tenant_id]) continue;
      if (o.delivery_status === "cancelled") continue;
      counts[o.tenant_id].orders += 1;
      counts[o.tenant_id].revenue += Number(o.selling_price ?? 0);
    }

    const ownerEmails: Record<string, string> = {};
    for (const t of tenants ?? []) {
      if (!t.owner_id || ownerEmails[t.owner_id]) continue;
      const { data } = await supabaseAdmin.auth.admin.getUserById(t.owner_id);
      if (data?.user?.email) ownerEmails[t.owner_id] = data.user.email;
    }

    const result = (tenants ?? []).map((t) => ({
      ...t,
      owner_email: t.owner_id ? ownerEmails[t.owner_id] ?? null : null,
      member_count: counts[t.id]?.members ?? 0,
      order_count: counts[t.id]?.orders ?? 0,
      revenue: Number((counts[t.id]?.revenue ?? 0).toFixed(2)),
    }));

    return new Response(JSON.stringify({ tenants: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
