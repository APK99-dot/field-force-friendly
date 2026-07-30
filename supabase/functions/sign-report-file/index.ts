// sign-report-file — mints a short-lived signed URL for a file in the private
// `report-files` bucket, after verifying the caller is entitled to it.
//
// Ported from staging-quickapp. Deviations, all forced by this app's identity
// model:
//   * The source gated on is_admin_or_manager(), which does not exist here. The
//     admin check is the same one every other edge function in this repo uses
//     (admin-create-user): resolve the caller from their JWT, then look for a
//     role = 'admin' row in public.user_roles with the service client.
//   * recipient_mode = 'all_managers' leaves report_subscriptions.recipient_user_ids
//     empty, so membership of that array cannot be the only recipient test. A
//     matching row in report_delivery_log (same storage_path, same recipient) is
//     accepted as well — that table is the authoritative record of who was
//     actually sent this file.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  SERVICE_ROLE;

const BUCKET = "report-files";
const EXPIRES_IN = 300; // seconds

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
      error: callerErr,
    } = await callerClient.auth.getUser();
    if (callerErr || !caller) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = caller.id;

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const { subscription_id, storage_path } = body;
    if (!subscription_id || !storage_path || typeof storage_path !== "string") {
      return json({ error: "subscription_id and storage_path are required" }, 400);
    }

    // The path must live under this subscription's own folder. Checked before
    // anything is signed, so a valid recipient of subscription A cannot use
    // their entitlement to read subscription B's files.
    if (!storage_path.startsWith(`${subscription_id}/`)) {
      return json({ error: "Path mismatch" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: roleRow, error: roleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleErr) {
      console.error("[sign-report-file] role lookup failed:", roleErr);
      return json({ error: "Could not verify your role" }, 500);
    }
    let allowed = !!roleRow;

    if (!allowed) {
      const { data: sub, error: subErr } = await admin
        .from("report_subscriptions")
        .select("recipient_user_ids, created_by")
        .eq("id", subscription_id)
        .maybeSingle();
      if (subErr) {
        console.error("[sign-report-file] subscription lookup failed:", subErr);
        return json({ error: subErr.message }, 500);
      }
      allowed =
        !!sub &&
        (sub.created_by === userId || (sub.recipient_user_ids ?? []).includes(userId));
    }

    if (!allowed) {
      // Fallback for recipient_mode = 'all_managers', where recipient_user_ids
      // is empty by design: was this exact file actually delivered to them?
      const { data: logRow, error: logErr } = await admin
        .from("report_delivery_log")
        .select("id")
        .eq("subscription_id", subscription_id)
        .eq("recipient_user_id", userId)
        .eq("storage_path", storage_path)
        .limit(1)
        .maybeSingle();
      if (logErr) {
        console.error("[sign-report-file] delivery log lookup failed:", logErr);
        return json({ error: logErr.message }, 500);
      }
      allowed = !!logRow;
    }

    if (!allowed) {
      return json({ error: "Forbidden" }, 403);
    }

    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(storage_path, EXPIRES_IN);
    if (signErr || !signed?.signedUrl) {
      console.error("[sign-report-file] signing failed:", signErr);
      return json({ error: signErr?.message ?? "Could not sign this file" }, 500);
    }

    return json({ url: signed.signedUrl, expires_in: EXPIRES_IN });
  } catch (e) {
    console.error("[sign-report-file] Unexpected error:", e);
    return json({ error: String(e) }, 500);
  }
});
