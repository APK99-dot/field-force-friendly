// Admin "login as user" — mints a real session for another user so an admin can
// see the app exactly as that person does.
//
// This is a privileged capability. Two rules it must never break:
//   1. Authorisation is decided HERE, server-side, from the caller's JWT. The UI
//      hiding the button is presentation, not a control.
//   2. Every successful impersonation is written to admin_impersonation_log
//      before the session is handed back, because from that point on the target
//      user's activity and the admin's are indistinguishable.
//
// The service role key stays in this function — it can never reach the browser.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // --- 1. Identify the caller from their JWT -------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const { data: { user: caller }, error: callerErr } = await admin.auth.getUser(token);
    if (callerErr || !caller) {
      return json({ error: "Invalid or expired token" }, 401);
    }

    // --- 2. Authorise: caller must hold the admin role -----------------------
    const { data: roleRow, error: roleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleErr) {
      console.error("[login-as] role lookup failed:", roleErr);
      return json({ error: "Could not verify permissions" }, 500);
    }
    if (!roleRow) {
      console.warn(`[login-as] DENIED for ${caller.email} (${caller.id}) — not an admin`);
      return json({ error: "Forbidden: admin role required" }, 403);
    }

    // --- 3. Validate the target ---------------------------------------------
    let body: { targetUserId?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const targetUserId = body?.targetUserId;
    if (!targetUserId) {
      return json({ error: "targetUserId is required" }, 400);
    }
    if (targetUserId === caller.id) {
      return json({ error: "You are already signed in as this user" }, 400);
    }

    const { data: targetData, error: targetErr } =
      await admin.auth.admin.getUserById(targetUserId);
    if (targetErr || !targetData?.user?.email) {
      return json({ error: "Target user not found, or has no email address" }, 404);
    }
    const target = targetData.user;

    // Refuse to impersonate a deactivated account — signing in as someone who
    // is not allowed to sign in themselves would defeat the deactivation.
    const { data: appUser } = await admin
      .from("users")
      .select("is_active")
      .eq("id", targetUserId)
      .maybeSingle();
    if (appUser && appUser.is_active === false) {
      return json({ error: "Cannot log in as a deactivated user" }, 400);
    }

    // --- 4. Record the impersonation BEFORE handing back a session ----------
    // Written first deliberately: if the audit insert fails, no session is
    // issued. An unlogged impersonation is worse than a failed one.
    const { error: auditErr } = await admin.from("admin_impersonation_log").insert({
      admin_user_id: caller.id,
      admin_email: caller.email,
      target_user_id: target.id,
      target_email: target.email,
      ip_address:
        req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? null,
      user_agent: req.headers.get("user-agent") ?? null,
    });
    if (auditErr) {
      console.error("[login-as] audit insert failed, refusing to issue session:", auditErr);
      return json({ error: "Could not record impersonation; login aborted" }, 500);
    }

    console.log(
      `[login-as] ${caller.email} (${caller.id}) -> ${target.email} (${target.id})`,
    );

    // --- 5. Mint a session for the target -----------------------------------
    // generateLink produces a one-time token without emailing anything;
    // verifyOtp exchanges it for a real session.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: target.email,
    });
    if (linkErr || !linkData?.properties) {
      console.error("[login-as] generateLink failed:", linkErr);
      return json({ error: "Failed to generate login session" }, 500);
    }

    const { hashed_token, verification_type } = linkData.properties;
    const { data: sessionData, error: sessionErr } = await admin.auth.verifyOtp({
      token_hash: hashed_token,
      type: verification_type as "magiclink",
    });
    if (sessionErr || !sessionData?.session) {
      console.error("[login-as] verifyOtp failed:", sessionErr);
      return json({ error: "Failed to create login session" }, 500);
    }

    return json({
      session: {
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
      },
      user: {
        id: target.id,
        email: target.email,
      },
    });
  } catch (e) {
    console.error("[login-as] unexpected error:", e);
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});
