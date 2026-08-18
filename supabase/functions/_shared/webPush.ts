// Web Push (VAPID + aes128gcm), shared by the push senders.
//
// Lifted out of dispatch-notification so send-push-notification can use it too.
// That function is what the notifications INSERT trigger calls, and it only ever
// spoke FCM — so anything routed through the trigger reached the APK and never
// the PWA. One implementation, both callers.
//
// Encryption follows RFC 8291 (key derivation) and RFC 8188 (content encoding).
// Do not "simplify" the info strings or the header layout: the push service
// accepts a malformed body with a 201 and the browser then drops it silently,
// which is indistinguishable from a delivered notification.

function b64urlToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concatBytes(...arrs: Uint8Array[]): Uint8Array {
  const len = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", k, data as BufferSource);
  return new Uint8Array(sig);
}

// HKDF-Expand (single block, length <= 32)
async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const t = await hmacSha256(prk, concatBytes(info, new Uint8Array([1])));
  return t.slice(0, length);
}

const TEXT = new TextEncoder();

/**
 * Normalize the VAPID subject. Apple is strict: it must be a bare
 * `mailto:user@domain` or `https://...` with no spaces or angle brackets.
 */
function normalizeVapidSubject(raw: string): string {
  let s = (raw || "").trim();
  if (!s) return "mailto:admin@bharathbuilders.app";
  // Strip angle brackets and internal spaces around the address.
  s = s.replace(/[<>]/g, "").replace(/\s+/g, "");
  if (s.startsWith("mailto:") || s.startsWith("https://") || s.startsWith("http://")) {
    return s;
  }
  // Bare email or domain — assume mailto.
  return `mailto:${s}`;
}

/** Build the ES256 VAPID JWT + return the Authorization header value. */
async function buildVapidAuth(
  endpoint: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  subject: string
): Promise<string> {
  const url = new URL(endpoint);
  const aud = `${url.protocol}//${url.host}`;
  const sub = normalizeVapidSubject(subject);


  const pubBytes = b64urlToBytes(vapidPublicKey); // 65 bytes: 0x04 || x || y
  const x = bytesToB64url(pubBytes.slice(1, 33));
  const y = bytesToB64url(pubBytes.slice(33, 65));
  const d = vapidPrivateKey; // already base64url raw 32-byte scalar

  const jwk: JsonWebKey = { kty: "EC", crv: "P-256", x, y, d, ext: true };
  const signKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const header = bytesToB64url(TEXT.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToB64url(
    TEXT.encode(
      JSON.stringify({
        aud,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub,
      })
    )
  );
  const signingInput = `${header}.${claims}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signKey,
    TEXT.encode(signingInput) as BufferSource
  );
  const jwt = `${signingInput}.${bytesToB64url(new Uint8Array(sig))}`;
  return `vapid t=${jwt}, k=${vapidPublicKey}`;
}

/** Encrypt the payload using aes128gcm content encoding (RFC 8291/8188). */
async function encryptPayload(
  plaintext: Uint8Array,
  uaPublicB64: string,
  authSecretB64: string
): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(uaPublicB64); // 65 bytes
  const authSecret = b64urlToBytes(authSecretB64); // 16 bytes

  // Ephemeral server keypair
  const asKeyPair = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  )) as CryptoKeyPair;
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", asKeyPair.publicKey)); // 65 bytes

  // ECDH shared secret
  const uaPublicKey = await crypto.subtle.importKey(
    "raw",
    uaPublic as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaPublicKey }, asKeyPair.privateKey, 256)
  );

  // Combine auth_secret + shared secret (RFC 8291)
  const prkCombine = await hmacSha256(authSecret, sharedSecret);
  const keyInfo = concatBytes(TEXT.encode("WebPush: info\0"), uaPublic, asPublicRaw);
  const ikm = await hkdfExpand(prkCombine, keyInfo, 32);

  // Content encryption (RFC 8188)
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmacSha256(salt, ikm);
  const cek = await hkdfExpand(prk, TEXT.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdfExpand(prk, TEXT.encode("Content-Encoding: nonce\0"), 12);

  // Plaintext + padding delimiter (0x02 = last record)
  const padded = concatBytes(plaintext, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek as BufferSource, { name: "AES-GCM" }, false, [
    "encrypt",
  ]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as BufferSource, tagLength: 128 },
      aesKey,
      padded as BufferSource
    )
  );

  // aes128gcm header: salt(16) || rs(4) || idlen(1) || keyid(asPublic) || ciphertext
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  const idlen = new Uint8Array([asPublicRaw.length]);
  return concatBytes(salt, rs, idlen, asPublicRaw, ciphertext);
}

export async function sendWebPush(
  supabase: any,
  recipientIds: string[],
  payload: {
    title: string;
    message: string;
    related_table?: string | null;
    related_id?: string | null;
    route?: string | null;
  }
): Promise<{ sent: number; failed: number; pruned: number; skipped?: string }> {
  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@bharathbuilders.app";
  if (!pub || !priv) {
    console.warn("[web-push] VAPID keys not configured — skipping");
    return { sent: 0, failed: 0, pruned: 0, skipped: "vapid_keys_missing" };
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

  const json = TEXT.encode(
    JSON.stringify({
      title: payload.title,
      message: payload.message,
      // sw.js navigates to data.url on notificationclick. Carry the caller's
      // route so a PWA banner opens the thing it is about — for a report that
      // is /my-reports?open=<id>, which opens the PDF straight away — rather
      // than dumping the user on the app root.
      data: {
        related_table: payload.related_table,
        related_id: payload.related_id,
        url: payload.route || "/",
      },
    })
  );

  const staleIds: string[] = [];
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subs.map(async (s: any) => {
      try {
        const authHeader = await buildVapidAuth(s.endpoint, pub, priv, subject);
        const bodyBytes = await encryptPayload(json, s.p256dh, s.auth);

        const res = await fetch(s.endpoint, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            TTL: String(60 * 60 * 24),
            Urgency: "high",
          },
          body: bodyBytes as BodyInit,
        });

        if (res.ok || res.status === 201) {
          sent++;
          supabase
            .from("web_push_subscriptions")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("id", s.id)
            .then(() => {}, () => {});
        } else {
          failed++;
          const txt = await res.text().catch(() => "");
          if (res.status === 404 || res.status === 410) {
            staleIds.push(s.id);
          } else {
            const host = (() => {
              try {
                return new URL(s.endpoint).host;
              } catch {
                return "unknown";
              }
            })();
            console.warn(`[web-push] send failed ${res.status} to ${host}: ${txt}`);
          }
        }
      } catch (e: any) {
        failed++;
        console.error("[web-push] send threw:", e?.message || String(e));
      }
    })
  );

  if (staleIds.length > 0) {
    await supabase.from("web_push_subscriptions").delete().in("id", staleIds);
  }

  return { sent, failed, pruned: staleIds.length };
}
