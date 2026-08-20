import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GUARD = "rls-probe-8f3a1c2e-temp";

Deno.serve(async (req) => {
  try {
    const { email, guard } = await req.json();
    if (guard !== GUARD) return new Response("no", { status: 403 });
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (error) throw error;
    return new Response(
      JSON.stringify({ hashed_token: data.properties?.hashed_token, email_otp: data.properties?.email_otp }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
});
