import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWebPush } from "../_shared/webPush.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface FCMPayload {
  user_id: string;
  title: string;
  message: string;
  /**
   * Optional in-app path to open when the notification is tapped, e.g.
   * "/my-reports". When present it is sent as an FCM `data` payload, which the
   * client reads in the pushNotificationActionPerformed listener. Absent by
   * default — callers that send no `route` produce exactly the same message
   * they did before.
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

  // Import the PEM private key
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
    const { user_id, title, message, route } = (await req.json()) as FCMPayload;
    if (!user_id || !title) {
      return new Response(JSON.stringify({ error: "Missing user_id or title" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Web Push (PWA) runs FIRST and independently of FCM.
    //
    // Both FCM guards below return early — one when no service-account key is
    // configured, one when the user has no device token. A PWA-only user has no
    // token by definition, so anything placed after them never runs for exactly
    // the people it exists to serve. The two channels are unrelated; neither
    // should gate the other.
    let webPush: unknown = null;
    try {
      webPush = await sendWebPush(supabase, [user_id], {
        title,
        message,
        route: route || "",
      });
    } catch (e) {
      console.error("Web push failed:", e);
      webPush = { error: String(e) };
    }

    const fcmKeyJson = Deno.env.get("FCM_SERVICE_ACCOUNT_KEY");
    if (!fcmKeyJson) {
      console.warn("FCM_SERVICE_ACCOUNT_KEY not configured — skipping FCM");
      return new Response(JSON.stringify({ fcm_skipped: true, web_push: webPush }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceAccount = JSON.parse(fcmKeyJson);
    const projectId = serviceAccount.project_id;

    const { data: tokens, error: tokErr } = await supabase
      .from("push_tokens")
      .select("id, token")
      .eq("user_id", user_id);

    if (tokErr || !tokens || tokens.length === 0) {
      // No APK on this account — normal for a PWA-only user. Web push above has
      // already run, so this is a partial success, not a no-op.
      console.log("No FCM tokens for user", user_id);
      return new Response(JSON.stringify({ sent: 0, web_push: webPush }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getAccessToken(serviceAccount);
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    // FCM HTTP v1 requires every `data` value to be a string. Built only when
    // the caller supplied a route, so the message sent for existing callers
    // (which pass no `route`) is unchanged.
    const dataPayload =
      typeof route === "string" && route.length > 0 ? { route } : undefined;

    let sent = 0;
    const staleIds: string[] = [];

    for (const t of tokens) {
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
            ...(dataPayload ? { data: dataPayload } : {}),
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
      } else {
        const errBody = await res.text();
        console.error("FCM error for token", t.token, errBody);
        // If token is unregistered / invalid, mark for cleanup
        if (
          errBody.includes("UNREGISTERED") ||
          errBody.includes("INVALID_ARGUMENT")
        ) {
          staleIds.push(t.id);
        }
      }
    }

    // Clean up stale tokens
    if (staleIds.length > 0) {
      await supabase.from("push_tokens").delete().in("id", staleIds);
      console.log("Removed stale tokens:", staleIds);
    }

    return new Response(
      JSON.stringify({ sent, cleaned: staleIds.length, web_push: webPush }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Push notification error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
