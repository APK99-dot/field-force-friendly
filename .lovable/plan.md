# Fix iOS PWA Web Push Delivery

## Diagnosis (confirmed via live test + DB)

The Web Push subscription pipeline on iOS is healthy. The failure is purely in the **send** step of the `dispatch-notification` edge function.

Evidence:
- `web_push_subscriptions` contains 2 valid iOS rows (Apple endpoints, p256dh + auth keys). One belongs to admin **Suyog**, who should receive leave/regularisation alerts.
- `notify_actor_chain` correctly resolves the admin/manager recipients — the in-app bell row for the leave request was inserted for Suyog.
- A live diagnostic dispatch to Suyog returned:

```text
"web_push": { "sent": 0, "failed": 1, "pruned": 0 }
```

`failed: 1` with `pruned: 0` means the send threw an exception that was **not** a 404/410 expired subscription. The send fails inside `npm:web-push@3.6.7`, which does not run correctly in the Supabase/Deno edge runtime (its Node `https` + crypto payload-encryption path throws). FCM works only because that path is hand-rolled with Web Crypto; Web Push is the one path still depending on the broken npm library. The error is currently swallowed by a `console.warn` in the catch block, which is why nothing reaches the device and the result looked "successful".

## Fix

Rewrite the `sendWebPush` helper in `supabase/functions/dispatch-notification/index.ts` to send Web Push natively with Web Crypto — no `npm:web-push` dependency.

Implementation pieces (all standard Web Crypto, same primitives already used for FCM JWT in this file):

1. **Remove** `import webpush from "npm:web-push@3.6.7"` and the `webpush.setVapidDetails` / `webpush.sendNotification` calls.
2. **VAPID auth (RFC 8292):** build an ES256 JWT signed with the VAPID private key (`VAPID_PRIVATE_KEY`), with `aud` = the push endpoint origin, `exp` ~12h, `sub` = `VAPID_SUBJECT`. Import the key via `crypto.subtle.importKey` (the VAPID keys are URL-safe base64; convert the raw private key to a JWK/PKCS8 form for `ECDSA P-256`).
3. **Payload encryption (RFC 8291, aes128gcm):**
   - Generate an ephemeral P-256 keypair.
   - Derive shared secret via ECDH with the subscription `p256dh`.
   - HKDF (SHA-256) using the subscription `auth` secret and salt to derive content-encryption key + nonce.
   - Encrypt the JSON payload with `AES-128-GCM` and frame it in the aes128gcm content-encoding header (salt + record size + ephemeral public key + ciphertext).
4. **POST to the endpoint** with headers: `Authorization: vapid t=<jwt>, k=<vapid public key>`, `Content-Encoding: aes128gcm`, `TTL`, `Content-Type: application/octet-stream`, `Urgency: high`.
5. **Status handling:** keep the existing prune logic — on `404`/`410` add to `staleIds` and delete; log other non-2xx with the response body so future failures are visible. Return `{ sent, failed, pruned }` as before.
6. **Better logging:** log the endpoint host + status code on failure (instead of swallowing) so the result and logs reflect real outcomes.

Optionally extract the encryption into a small inline helper within the same `index.ts` (edge functions must stay single-file).

## Validation

1. Deploy the updated function.
2. Re-run the same diagnostic dispatch to admin Suyog (`f21e7370-…`) and confirm the response shows `web_push: { sent: 1, failed: 0 }`.
3. On the iPhone 15 PWA (Home Screen), confirm the banner appears.
4. Trigger a real leave request from a normal user and confirm the admin/manager receives the iOS system notification, and that `notify_actor_chain` resolves + sends to the Web Push subscription.

## Notes

- No frontend, subscription, or VAPID-key changes are required — keys and subscriptions are already correct and consistent.
- APK/FCM behaviour is untouched.
