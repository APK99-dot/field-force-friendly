import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

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

    // 2) Send Web Push (iPhone PWA + desktop browsers) — runs in parallel with FCM
    const webPushResult = await sendWebPush(supabase, recipient_ids, {
      title,
      message,
      related_table,
      related_id,
    });

    // 3) Send FCM push notifications (Android APK)
    const fcmKeyJson = Deno.env.get("FCM_SERVICE_ACCOUNT_KEY");
    if (!fcmKeyJson) {
      console.warn("[dispatch] FCM_SERVICE_ACCOUNT_KEY not configured — skipping FCM");
      return new Response(
        JSON.stringify({ notifications_inserted: rows.length, fcm_skipped: true, web_push: webPushResult }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceAccount = JSON.parse(fcmKeyJson);
    const projectId = serviceAccount.project_id;

    // Purge tokens not seen in 60+ days (stale / uninstalled devices)
    try {
      const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const { error: purgeErr, count } = await supabase
        .from("push_tokens")
        .delete({ count: "exact" })
        .lt("last_seen_at", cutoff);
      if (purgeErr) console.warn("[dispatch] Stale purge failed:", purgeErr);
      else if (count) console.log(`[dispatch] Purged ${count} stale tokens`);
    } catch (e) {
      console.warn("[dispatch] Stale purge threw:", e);
    }

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

    // Diagnostic: which recipients have NO registered Android token? These users
    // will only see the in-app bell, not a system banner, until they reopen the
    // (current) APK so its FCM token re-registers.
    const usersWithTokens = new Set(tokens.map((t: any) => t.user_id));
    const recipientsWithoutTokens = recipient_ids.filter((id) => !usersWithTokens.has(id));
    if (recipientsWithoutTokens.length > 0) {
      console.warn(`[dispatch] ${recipientsWithoutTokens.length} recipient(s) have NO Android push token:`, recipientsWithoutTokens);
    }

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
          if (errBody.includes("UNREGISTERED") || errBody.includes("NOT_FOUND") || errBody.includes("INVALID_ARGUMENT")) {
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
      recipients_without_token: recipientsWithoutTokens.length,
      web_push: webPushResult,
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

// ---- Web Push (iPhone PWA + desktop) ---------------------------------------
async function sendWebPush(
  supabase: any,
  recipientIds: string[],
  payload: { title: string; message: string; related_table?: string | null; related_id?: string | null }
): Promise<{ sent: number; failed: number; pruned: number; skipped?: string }> {
  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@bharathbuilders.app";
  if (!pub || !priv) {
    console.warn("[web-push] VAPID keys not configured — skipping");
    return { sent: 0, failed: 0, pruned: 0, skipped: "vapid_keys_missing" };
  }
  try {
    webpush.setVapidDetails(subject, pub, priv);
  } catch (e) {
    console.error("[web-push] setVapidDetails failed:", e);
    return { sent: 0, failed: 0, pruned: 0, skipped: "vapid_invalid" };
  }

  const { data: subs, error } = await supabase
    .from("web_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", recipientIds);

  if (error) {
    console.error("[web-push] fetch subscriptions failed:", error);
    return { sent: 0, failed: 0, pruned: 0, skipped: "fetch_failed" };
  }
  if (!subs || subs.length === 0) {
    return { sent: 0, failed: 0, pruned: 0 };
  }

  const json = JSON.stringify({
    title: payload.title,
    message: payload.message,
    data: { related_table: payload.related_table, related_id: payload.related_id, url: "/" },
  });

  const staleIds: string[] = [];
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subs.map(async (s: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          json,
          { TTL: 60 * 60 * 24 }
        );
        sent++;
        // Refresh last_seen_at (fire & forget)
        supabase
          .from("web_push_subscriptions")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", s.id)
          .then(() => {}, () => {});
      } catch (e: any) {
        failed++;
        const status = e?.statusCode;
        if (status === 404 || status === 410) {
          staleIds.push(s.id);
        } else {
          console.warn("[web-push] send failed:", status, e?.body || e?.message);
        }
      }
    })
  );

  if (staleIds.length > 0) {
    await supabase.from("web_push_subscriptions").delete().in("id", staleIds);
  }

  return { sent, failed, pruned: staleIds.length };
}
