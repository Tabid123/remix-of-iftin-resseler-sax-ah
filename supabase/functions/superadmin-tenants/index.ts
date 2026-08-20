import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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

    const setUsersBanned = async (tenantId: string, banned: boolean) => {
      const { data: mem } = await supabaseAdmin
        .from("tenant_members")
        .select("user_id")
        .eq("tenant_id", tenantId);
      const ids = new Set<string>((mem ?? []).map((m: any) => m.user_id).filter(Boolean));
      const { data: t } = await supabaseAdmin.from("tenants").select("owner_id").eq("id", tenantId).maybeSingle();
      if (t?.owner_id) ids.add(t.owner_id);
      let affected = 0;
      for (const id of ids) {
        if (id === caller.id) continue; // never lock out the acting super admin
        const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
          ban_duration: banned ? "876000h" : "none",
        } as any);
        if (!error) affected += 1;
      }
      return affected;
    };

    if (action === "update") {
      const { tenant_id, plan, status } = body;
      if (!tenant_id) throw new Error("tenant_id required");
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (plan) patch.plan = plan;
      if (status) patch.status = status;
      const { error } = await supabaseAdmin.from("tenants").update(patch).eq("id", tenant_id);
      if (error) throw error;
      if (status === "suspended") await setUsersBanned(tenant_id, true);
      if (status === "active") await setUsersBanned(tenant_id, false);
      return json({ success: true });
    }

    if (action === "detail") {
      const { tenant_id } = body;
      if (!tenant_id) throw new Error("tenant_id required");

      const { data: tenant, error: tErr } = await supabaseAdmin
        .from("tenants")
        .select("*")
        .eq("id", tenant_id)
        .maybeSingle();
      if (tErr) throw tErr;
      if (!tenant) throw new Error("Tenant not found");

      const { data: creds } = await supabaseAdmin
        .from("tenant_admin_credentials")
        .select("id, user_id, email, initial_password, created_at, updated_at")
        .eq("tenant_id", tenant_id)
        .order("created_at", { ascending: true });

      const { data: mem } = await supabaseAdmin
        .from("tenant_members")
        .select("user_id, role, member_role, created_at")
        .eq("tenant_id", tenant_id);

      const memberIds = new Set<string>((mem ?? []).map((m: any) => m.user_id).filter(Boolean));
      if (tenant.owner_id) memberIds.add(tenant.owner_id);

      const users: Record<string, any> = {};
      for (const id of memberIds) {
        const { data } = await supabaseAdmin.auth.admin.getUserById(id);
        if (data?.user) {
          users[id] = {
            email: data.user.email,
            last_sign_in_at: data.user.last_sign_in_at,
            banned: !!(data.user as any).banned_until &&
              new Date((data.user as any).banned_until).getTime() > Date.now(),
          };
        }
      }

      const members = (mem ?? []).map((m: any) => ({
        user_id: m.user_id,
        role: m.role ?? m.member_role ?? "member",
        created_at: m.created_at,
        email: users[m.user_id]?.email ?? null,
        last_sign_in_at: users[m.user_id]?.last_sign_in_at ?? null,
        banned: users[m.user_id]?.banned ?? false,
      }));

      const credentials = (creds ?? []).map((c: any) => ({
        ...c,
        last_sign_in_at: c.user_id ? users[c.user_id]?.last_sign_in_at ?? null : null,
        banned: c.user_id ? users[c.user_id]?.banned ?? false : false,
      }));

      const [{ count: orderCount }, { count: deviceCount }] = await Promise.all([
        supabaseAdmin.from("orders").select("id", { count: "exact", head: true }).eq("tenant_id", tenant_id),
        supabaseAdmin.from("android_devices").select("id", { count: "exact", head: true }).eq("tenant_id", tenant_id),
      ]);

      return json({
        tenant,
        credentials,
        members,
        owner_email: tenant.owner_id ? users[tenant.owner_id]?.email ?? null : null,
        stats: { orders: orderCount ?? 0, devices: deviceCount ?? 0, members: members.length },
      });
    }

    if (action === "set_password") {
      const { tenant_id, user_id, email, password } = body;
      if (!tenant_id || !password || String(password).length < 6) {
        throw new Error("tenant_id iyo password (ugu yaraan 6 xaraf) waa loo baahan yahay");
      }
      let targetId = user_id as string | undefined;
      if (!targetId && email) {
        const { data: cred } = await supabaseAdmin
          .from("tenant_admin_credentials")
          .select("user_id")
          .eq("tenant_id", tenant_id)
          .eq("email", email)
          .maybeSingle();
        targetId = cred?.user_id ?? undefined;
      }
      if (!targetId) throw new Error("User lama helin");
      const { error } = await supabaseAdmin.auth.admin.updateUserById(targetId, { password });
      if (error) throw error;
      await supabaseAdmin
        .from("tenant_admin_credentials")
        .update({ initial_password: password, updated_at: new Date().toISOString() })
        .eq("tenant_id", tenant_id)
        .eq("user_id", targetId);
      return json({ success: true });
    }

    if (action === "set_access") {
      const { tenant_id, user_id, banned } = body;
      if (!tenant_id) throw new Error("tenant_id required");
      if (user_id) {
        if (user_id === caller.id) throw new Error("Naftaada ma xidhi kartid");
        const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
          ban_duration: banned ? "876000h" : "none",
        } as any);
        if (error) throw error;
        return json({ success: true, affected: 1 });
      }
      const affected = await setUsersBanned(tenant_id, !!banned);
      await supabaseAdmin
        .from("tenants")
        .update({ status: banned ? "suspended" : "active", updated_at: new Date().toISOString() })
        .eq("id", tenant_id);
      return json({ success: true, affected });
    }

    if (action === "delete") {
      const { tenant_id, confirm_slug, delete_users } = body;
      if (!tenant_id) throw new Error("tenant_id required");
      const { data: tenant } = await supabaseAdmin
        .from("tenants")
        .select("id, slug")
        .eq("id", tenant_id)
        .maybeSingle();
      if (!tenant) throw new Error("Tenant not found");
      if (confirm_slug !== tenant.slug) throw new Error("Slug-ga xaqiijinta waa khalad");

      const { data: mem } = await supabaseAdmin
        .from("tenant_members")
        .select("user_id")
        .eq("tenant_id", tenant_id);

      const { error } = await supabaseAdmin.from("tenants").delete().eq("id", tenant_id);
      if (error) throw error;

      if (delete_users) {
        for (const m of mem ?? []) {
          if (!m.user_id || m.user_id === caller.id) continue;
          await supabaseAdmin.auth.admin.deleteUser(m.user_id);
        }
      }
      return json({ success: true });
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

    return json({ tenants: result });
  } catch (err: any) {
    return json({ error: err.message }, 400);
  }
});
