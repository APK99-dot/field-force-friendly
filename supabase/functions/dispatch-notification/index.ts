import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface DispatchPayload {
  recipient_ids?: string[];
  broadcast_all_active?: boolean;
  exclude_user_id?: string;
  // Resolve recipients server-side as the actor's reporting manager + all
  // admins (used for leave / regularization requests). Bypasses client RLS so
  // admins are never dropped.
  notify_actor_chain?: boolean;
  actor_user_id?: string;
  title: string;
  message: string;
  type?: string;
  related_table?: string;
  related_id?: string;
  /**
   * Optional in-app path for the push banner to open when tapped, e.g.
   * "/my-reports?open=<uuid>". When present it is sent to FCM as data.route,
   * which src/hooks/usePushNotifications.ts reads (and re-validates as a
   * same-origin path) in its pushNotificationActionPerformed handler.
   * Omitting it leaves the FCM message byte-for-byte as it was before.
   */
  route?: string;
}

/** Build a JWT from the service-account JSON for FCM HTTP v1. */
async function getAccessToken(sa: {
  client_email: string;
  private_key: string;
  token_uri: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: sa.token_uri,
      iat: now,
      exp: now + 3600,
    })
  );

  const textEncoder = new TextEncoder();
  const inputData = textEncoder.encode(`${header}.${payload}`);

  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    inputData
  );
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${header}.${payload}.${sig}`;

  const tokenRes = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Failed to get access token: ${err}`);
  }

  const { access_token } = await tokenRes.json();
  return access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as DispatchPayload;
    const { title, message, type, related_table, related_id } = body;

    if (!title || !message) {
      return new Response(
        JSON.stringify({ error: "Missing title or message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const shouldBroadcastAttendance =
      related_table === "attendance" &&
      type === "attendance" &&
      (title.startsWith("Check-In - ") || title.startsWith("Day End - "));

    let recipient_ids: string[] = [];
    if (body.broadcast_all_active || shouldBroadcastAttendance) {
      const { data: activeUsers, error: activeErr } = await supabase
        .from("users")
        .select("id, full_name")
        .eq("is_active", true);

      if (activeErr) {
        console.error("[dispatch] Failed to resolve active broadcast recipients:", activeErr);
        return new Response(
          JSON.stringify({ error: "Failed to resolve active recipients" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const attendanceActorName = shouldBroadcastAttendance
        ? title.replace(/^Check-In - |^Day End - /, "").trim()
        : "";
      const inferredActorId = attendanceActorName
        ? (activeUsers || []).find((u: any) => (u.full_name || "").trim() === attendanceActorName)?.id
        : undefined;
      const excludedUserId = body.exclude_user_id || inferredActorId;

      recipient_ids = (activeUsers || [])
        .map((u: any) => u.id as string)
        .filter((id) => id !== excludedUserId);
    } else if (body.notify_actor_chain && body.actor_user_id) {
      // Resolve reporting manager + all admins server-side (RLS-safe).
      const [{ data: actor }, { data: admins, error: adminErr }] = await Promise.all([
        supabase
          .from("users")
          .select("reporting_manager_id")
          .eq("id", body.actor_user_id)
          .maybeSingle(),
        supabase.from("user_roles").select("user_id").eq("role", "admin"),
      ]);

      if (adminErr) {
        console.error("[dispatch] Failed to resolve admins for actor chain:", adminErr);
      }

      const set = new Set<string>();
      if (actor?.reporting_manager_id) set.add(actor.reporting_manager_id as string);
      (admins || []).forEach((a: any) => set.add(a.user_id as string));
      set.delete(body.actor_user_id);
      recipient_ids = Array.from(set);
    } else if (Array.isArray(body.recipient_ids)) {
      recipient_ids = body.recipient_ids;
    }

    recipient_ids = Array.from(new Set(recipient_ids.filter(Boolean)));
    if (recipient_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "No notification recipients resolved" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[dispatch] Recipients: ${recipient_ids.length}, broadcast_all_active: ${!!body.broadcast_all_active}, attendance_auto_broadcast: ${shouldBroadcastAttendance}, title: "${title}"`);

    // Insert the notification rows. That is all this function does now.
    //
    // It used to insert AND push, while the notifications INSERT trigger pushed
    // as well — so everything from here went out twice. That is why
    // push_dispatch_config.is_enabled had to be left off, which in turn meant
    // rule-driven notifications never pushed at all. The trigger is now the
    // single sender and this function the single writer.
    //
    // route rides in metadata because the trigger only ever sees the row.
    // Reports deep-link to /my-reports?open=<delivery_log_id>, an id that
    // cannot be reconstructed from related_id, so it must travel with the row.
    const routeStr = typeof body.route === "string" ? body.route.trim() : "";
    const rows = recipient_ids.map((uid) => ({
      user_id: uid,
      title,
      message,
      type: type || "info",
      related_table: related_table || null,
      related_id: related_id || null,
      metadata: routeStr ? { route: routeStr } : null,
    }));

    const { error: insertErr } = await supabase.from("notifications").insert(rows);
    if (insertErr) {
      console.error("[dispatch] Failed to insert notifications:", insertErr);
    } else {
      console.log(`[dispatch] Inserted ${rows.length} notification rows`);
    }

    return new Response(
      JSON.stringify({ notifications_inserted: rows.length, push: "via_insert_trigger" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[dispatch] Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ---- Web Push (iPhone PWA + desktop) ---------------------------------------
// Native implementation using Web Crypto only (no npm:web-push, which fails to
// run inside the Deno edge runtime). Implements VAPID (RFC 8292) + aes128gcm
// payload encryption (RFC 8291 / RFC 8188).

