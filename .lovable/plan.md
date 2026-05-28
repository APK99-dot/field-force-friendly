# iPhone PWA Onboarding + Cross-Platform Notifications

## Goal
iPhone users get guided to install the app to Home Screen and enable notifications. All listed events (attendance, leave, regularization, expense, activity) deliver to web bell, Android APK, and iPhone PWA. Admins always receive all member events.

## Important iOS constraints (so expectations match reality)
- iOS Safari **does not allow web push from a browser tab**. Push only works after the user adds the site to Home Screen and opens it as a standalone PWA (iOS 16.4+).
- iOS PWA push requires a real **service worker** + **Web Push (VAPID)** subscription. Today the app has no SW and `dispatch-notification` only sends FCM data messages to Android via `push_tokens`.
- We will add a minimal PWA (manifest + SW) and a Web Push delivery path alongside the existing FCM Android path. Lovable preview is iframed, so SW will be registered only on the published domain (not in the editor preview).

## Scope of work

### 1. PWA shell for iOS install
- Add `public/manifest.webmanifest` (name "Bharath Builders", icons 192/512 already present, `display: "standalone"`, theme/background colors from tokens, `start_url: "/"`).
- Add iOS meta tags to `index.html`: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon` (link to 192 icon), `apple-mobile-web-app-title`.
- Add a tiny custom service worker at `public/sw.js` (no Workbox, no precaching — avoids stale-shell issues). It handles `push` and `notificationclick` only, plus `skipWaiting`/`clients.claim`. No HTML caching.
- Register SW from `src/main.tsx` **only when**: not in iframe, not on `lovableproject.com`/`id-preview--` host, and `'serviceWorker' in navigator`.

### 2. iPhone install guidance banner
- New component `src/components/IOSInstallPrompt.tsx`. Detects iOS/iPadOS Safari (UA + `navigator.standalone === false`).
- If not running standalone, shows a bottom sheet with step-by-step illustration: "Tap Share → Add to Home Screen → Open from Home Screen". Dismiss persists 24h in `localStorage` (matches existing `PWAInstallBanner` pattern).
- Existing `PWAInstallBanner.tsx` already has an iOS branch — we'll replace its iOS copy with the richer guided sheet rather than add a second banner. Android/desktop path stays the same.

### 3. Notification enablement UX
- New component `src/components/NotificationsEnableCard.tsx` rendered in **Profile page** (`src/pages/Profile.tsx`) and in **More** screen for visibility.
- States:
  - **Web (desktop/Android Chrome)**: button "Enable Notifications" → requests `Notification.permission` + subscribes via Push API with VAPID public key.
  - **Android APK**: defers to existing `usePushNotifications` (Capacitor). Card shows "Enabled" if a `push_tokens` row exists for this device.
  - **iPhone, not installed**: card shows "Install app first" + opens the iOS install sheet.
  - **iPhone, installed standalone**: button "Enable Notifications" → requests permission + Push subscription.
  - **Permission denied**: shows iOS-specific instructions ("iPhone Settings → Notifications → Bharath Builders → Allow Notifications") and Android/desktop equivalents.

### 4. Web Push backend
- New table `web_push_subscriptions(user_id, endpoint unique, p256dh, auth, user_agent, last_seen_at)` with RLS + GRANTs (user owns rows; service_role full).
- New edge function `register-web-push` to upsert a subscription from the browser.
- Secrets to add: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto). I will ask the user for these or generate via a small script.
- Update `supabase/functions/dispatch-notification`:
  - In addition to FCM (Android), fetch `web_push_subscriptions` for recipients and send Web Push via standard VAPID `aes128gcm` (no extra npm — use Deno's `crypto.subtle`; or import `npm:web-push` if available in Edge runtime). Stale subs (`410`/`404`) get deleted.
  - Keep existing in-app `notifications` insert and FCM path unchanged.

### 5. Notification coverage (event sources)
Audit and ensure each event calls `sendNotificationWithPush` with the correct recipient set. Recipients computed as: `actor's manager + all admins + actor for self-confirmation where appropriate` (admins always included). Broadcast variant `getAllActiveUserIds` is kept only for attendance, per existing decision.

| Event | Trigger location | Recipients |
|---|---|---|
| Day Start / Check-In | `useAttendance` (already broadcast) | all active users |
| Day End / Check-Out | `useAttendance` (already broadcast) | all active users |
| Leave application submitted | leave submit hook/page | manager + admins |
| Leave approved/rejected | approvals action | applicant + admins |
| Regularization submitted | regularization submit | manager + admins |
| Regularization approved/rejected | approvals action | applicant + admins |
| Expense submitted | expense submit | manager + admins |
| Expense approved/rejected | approvals action | applicant + admins |
| Activity created / completed | activity create + status change | manager + admins |

Each missing or incomplete call site will be wired to `sendNotificationWithPush` using `getNotificationRecipients` (already returns manager + admins, deduped).

### 6. No UI changes to existing bell / cards
`NotificationBell` and the in-app notification list stay as-is. Only additive components (install sheet, enable card) are introduced.

## Files to add / change
**Add**
- `public/manifest.webmanifest`
- `public/sw.js`
- `src/components/IOSInstallPrompt.tsx`
- `src/components/NotificationsEnableCard.tsx`
- `src/utils/webPush.ts` (subscribe/unsubscribe helpers)
- `supabase/functions/register-web-push/index.ts`
- Migration: `web_push_subscriptions` table + RLS + GRANTs

**Edit**
- `index.html` (manifest link + iOS meta tags)
- `src/main.tsx` (guarded SW registration)
- `src/components/PWAInstallBanner.tsx` (replace iOS branch with new guided sheet trigger)
- `src/pages/Profile.tsx`, `src/pages/More.tsx` (mount `NotificationsEnableCard`)
- `supabase/functions/dispatch-notification/index.ts` (add Web Push fan-out)
- Notification call sites for leave/regularization/expense/activity events that are currently missing

## Open questions before I build
1. **VAPID keys** — do you want me to generate and store them as Lovable Cloud secrets (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`)? Required for iOS + desktop web push.
2. **iOS install copy** — OK to use plain text + Share-icon illustration, or do you have an existing screenshot/asset you want shown?
3. **Activity events** — for "created" and "completed", should the actor themselves also get a confirmation push, or only manager + admins?
