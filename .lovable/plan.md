

## Plan: Enable Native Android Push Notifications via FCM

### Overview
Currently, notifications only exist as in-app records (bell icon). To deliver native Android push notifications when the app is backgrounded/closed, we need Firebase Cloud Messaging (FCM) integrated end-to-end.

### Architecture

```text
┌─────────────────┐     INSERT into      ┌──────────────┐
│ App (leave      │ ──────────────────►   │ notifications│
│ apply/approve/  │                       │ table        │
│ reject)         │                       └──────┬───────┘
                                                 │
                                          DB trigger (AFTER INSERT)
                                                 │
                                          ┌──────▼───────┐
                                          │ send-push-   │
                                          │ notification │
                                          │ (edge func)  │
                                          └──────┬───────┘
                                                 │
                                          FCM HTTP v1 API
                                                 │
                                          ┌──────▼───────┐
                                          │ Android      │
                                          │ device       │
                                          └──────────────┘
```

### Prerequisites (User Action Required)
Before implementation, you will need to:
1. **Create a Firebase project** at console.firebase.google.com
2. **Enable Cloud Messaging** in the Firebase project
3. **Download `google-services.json`** and place it in `android/app/`
4. **Provide the FCM service account key** (JSON) — we'll store it as a backend secret

### Implementation Steps

#### 1. Database: Store FCM device tokens
Create a `push_tokens` table to map users to their device FCM tokens:
- `id`, `user_id` (references auth.users), `token` (text, unique), `platform` (text), `created_at`
- RLS: users can insert/delete their own tokens only

#### 2. Database: Trigger on notifications table
Create an `AFTER INSERT` trigger on `notifications` that calls `pg_net` to invoke an edge function (`send-push-notification`) with the new notification's `user_id`, `title`, and `message`.

#### 3. Edge Function: `send-push-notification`
- Receives `user_id`, `title`, `message` from the trigger webhook
- Looks up all FCM tokens for that `user_id` from `push_tokens`
- Sends FCM HTTP v1 API request to each token
- Removes stale/invalid tokens on FCM error responses
- Uses the FCM service account key secret for authentication

#### 4. Frontend: Register FCM token on login
- Install `@capacitor-firebase/messaging` plugin
- On native platform + successful auth, request notification permission, get FCM token
- Upsert the token into `push_tokens` table
- Listen for token refresh events and update accordingly
- Create a `usePushNotifications` hook called from `App.tsx`

#### 5. Capacitor Config
- Add `PushNotifications` plugin config to `capacitor.config.ts`

#### 6. Android Setup (User-side)
- User must add `google-services.json` to `android/app/`
- User must run `npx cap sync android` after pulling changes

### Files to Create/Modify
- **New migration**: `push_tokens` table + trigger on `notifications`
- **New edge function**: `supabase/functions/send-push-notification/index.ts`
- **New hook**: `src/hooks/usePushNotifications.ts`
- **Modified**: `src/App.tsx` — use the new hook
- **Modified**: `capacitor.config.ts` — add push plugin config

### What stays the same
- All existing in-app notification logic (bell icon, realtime subscription) remains untouched
- The notification insert points (leave apply, approve, reject) don't change — the DB trigger fires automatically on any insert

