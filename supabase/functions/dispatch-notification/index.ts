import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface DispatchPayload {
  recipient_ids: string[];
  title: string;
  message: string;
  type?: string;
  related_table?: string;
  related_id?: string;
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
    const { recipient_ids, title, message, type, related_table, related_id } = body;

    if (!recipient_ids || !Array.isArray(recipient_ids) || recipient_ids.length === 0 || !title || !message) {
      return new Response(
        JSON.stringify({ error: "Missing recipient_ids, title, or message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[dispatch] Recipients: ${recipient_ids.length}, title: "${title}"`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1) Insert in-app notification rows (bell icon)
    const rows = recipient_ids.map((uid) => ({
      user_id: uid,
      title,
      message,
      type: type || "info",
      related_table: related_table || null,
      related_id: related_id || null,
    }));

    const { error: insertErr } = await supabase.from("notifications").insert(rows);
    if (insertErr) {
      console.error("[dispatch] Failed to insert notifications:", insertErr);
    } else {
      console.log(`[dispatch] Inserted ${rows.length} notification rows`);
    }

    // 2) Send FCM push notifications
    const fcmKeyJson = Deno.env.get("FCM_SERVICE_ACCOUNT_KEY");
    if (!fcmKeyJson) {
      console.warn("[dispatch] FCM_SERVICE_ACCOUNT_KEY not configured — skipping push");
      return new Response(
        JSON.stringify({ notifications_inserted: rows.length, push_skipped: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceAccount = JSON.parse(fcmKeyJson);
    const projectId = serviceAccount.project_id;

    // Fetch all tokens for all recipients in one query
    const { data: tokens, error: tokErr } = await supabase
      .from("push_tokens")
      .select("id, user_id, token")
      .in("user_id", recipient_ids);

    if (tokErr) {
      console.error("[dispatch] Error fetching push tokens:", tokErr);
      return new Response(
        JSON.stringify({ notifications_inserted: rows.length, push_error: "token_fetch_failed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!tokens || tokens.length === 0) {
      console.log("[dispatch] No push tokens found for any recipient");
      return new Response(
        JSON.stringify({ notifications_inserted: rows.length, push_sent: 0, push_tokens_found: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[dispatch] Found ${tokens.length} push tokens for ${recipient_ids.length} recipients`);

    let accessToken: string;
    try {
      accessToken = await getAccessToken(serviceAccount);
    } catch (e) {
      console.error("[dispatch] FCM auth failed:", e);
      return new Response(
        JSON.stringify({ notifications_inserted: rows.length, push_error: "fcm_auth_failed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
    let sent = 0;
    const staleIds: string[] = [];

    for (const t of tokens) {
      try {
        const res = await fetch(fcmUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: t.token,
              notification: { title, body: message },
              android: {
                priority: "high",
                notification: {
                  sound: "default",
                  channel_id: "default",
                },
              },
            },
          }),
        });

        if (res.ok) {
          sent++;
          console.log(`[dispatch] FCM sent OK to user ${t.user_id}`);
        } else {
          const errBody = await res.text();
          console.error(`[dispatch] FCM error for user ${t.user_id}:`, errBody);
          if (errBody.includes("UNREGISTERED") || errBody.includes("INVALID_ARGUMENT")) {
            staleIds.push(t.id);
          }
        }
      } catch (e) {
        console.error(`[dispatch] FCM fetch error for user ${t.user_id}:`, e);
      }
    }

    // Clean up stale tokens
    if (staleIds.length > 0) {
      await supabase.from("push_tokens").delete().in("id", staleIds);
      console.log(`[dispatch] Removed ${staleIds.length} stale tokens`);
    }

    const result = {
      notifications_inserted: rows.length,
      push_tokens_found: tokens.length,
      push_sent: sent,
      push_stale_cleaned: staleIds.length,
    };
    console.log("[dispatch] Result:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[dispatch] Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
