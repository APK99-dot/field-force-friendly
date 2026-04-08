
## Plan: Fix Android Push Notifications End-to-End

### What I verified
- Android device tokens are being saved in `push_tokens`
- The backend push function works when called directly and reports `sent: 1`
- In-app bell notifications are being inserted into `notifications`
- There are no automatic backend logs for `send-push-notification` during real app events

### Do I know what the issue is?
Yes.

### Exact problem
The current system now depends entirely on client-side push dispatch:

```text
event in app
→ insert notifications row (works)
→ fire-and-forget functions.invoke("send-push-notification") (unreliable / not reaching backend)
→ no system push
```

The database trigger was removed, so there is no backend fallback anymore.  
Right now, if the client-side invoke does not complete, the app still shows bell notifications but Android never gets a real push.

The strongest evidence is:
- recent notification rows exist
- recent push tokens exist
- manual backend push works
- zero automatic backend function logs exist

That means the broken link is the client helper, not FCM itself.

---

## Fix approach

### 1) Move notification delivery fully to the backend
I will replace the current “insert locally + fire-and-forget invoke per user” flow with one awaited backend call.

New flow:

```text
event in app
→ call one backend notification dispatcher
→ backend inserts bell notifications
→ backend sends FCM pushes
→ backend returns delivery result
```

Why this is better:
- no fragile fire-and-forget requests from the WebView
- one request instead of many
- proper logs for every notification event
- bell + push stay in sync

### 2) Keep the existing push registration hook, but harden it
`usePushNotifications.ts` is mostly for token capture and Android channel setup. I will keep that role, but tighten it so token registration is more observable and resilient:
- log permission state clearly
- log registration success/failure more clearly
- keep creating the `default` Android channel
- keep deferred registration for Android 13+ crash avoidance
- make token save failures easier to diagnose

### 3) Refactor all notification events to use the backend dispatcher
I will update all current notification flows to call the new centralized helper so these all behave the same way:
- leave applied → manager + admins
- leave approved/rejected → employee
- check-in → manager + admins
- check-out / day end → manager + admins
- regularisation request → manager + admins
- regularisation approved/rejected → employee

### 4) Add backend-side logging for delivery diagnostics
The backend dispatcher and push sender should log:
- recipient IDs
- token count per recipient
- FCM accepted / failed counts
- stale token cleanup
- validation errors

That way I can confirm end-to-end whether:
- the app called the backend
- the backend found tokens
- FCM accepted the message

---

## Files to update

### Frontend
- `src/utils/notificationHelpers.ts`
- `src/hooks/usePushNotifications.ts`
- `src/components/LeaveApplicationModal.tsx`
- `src/components/RegularizationRequestModal.tsx`
- `src/hooks/useAttendance.ts`
- `src/pages/AttendanceManagement.tsx`
- `src/pages/PendingApprovals.tsx`

### Backend
- new backend notification dispatcher function
- likely reuse or refactor:
  - `supabase/functions/send-push-notification/index.ts`

---

## Implementation steps

### Step 1: Create a backend notification dispatcher
Add a backend function that accepts:
- `recipient_ids`
- `title`
- `message`
- `type`
- `related_table`
- `related_id`

It will:
1. validate input
2. insert notification rows for the bell icon
3. send FCM push to each recipient’s saved token(s)
4. return structured results

This becomes the single source of truth for delivery.

### Step 2: Refactor `sendNotificationWithPush`
Change `src/utils/notificationHelpers.ts` so it no longer:
- inserts directly from the client, then
- fires un-awaited per-user invoke calls

Instead it will:
- call the new backend dispatcher
- await completion
- log returned result
- surface meaningful errors when delivery setup fails

### Step 3: Keep recipients logic, but centralize execution
`getNotificationRecipients()` can remain client-side for now since it already matches the requested routing, but the actual write/send action will move server-side.

If needed, I may move recipient lookup into the backend too for maximum reliability.

### Step 4: Harden push registration
Update `usePushNotifications.ts` to:
- keep `default` channel creation
- keep deferred registration after permission grant
- improve logging around:
  - permission status
  - registration callback
  - token save result
- ensure the token path is easy to verify after login

### Step 5: Improve backend push sender robustness
Tighten `send-push-notification` so it is easier to trust in production:
- improve request validation
- improve logs
- make FCM auth/token creation more explicit
- preserve stale-token cleanup
- return counts that help confirm delivery attempts

### Step 6: Rewire every event flow
Update all leave / attendance / regularisation paths so they all use the same backend-backed helper, not mixed approaches.

That removes the current inconsistency where:
- bell notification definitely happens
- push may or may not happen

---

## Why this should fix the user-reported behavior
The user’s exact symptom is:

```text
bell icon works
Android system notification panel does not
```

That happens when notification rows are inserted but no FCM request is actually sent.  
That is exactly what the current codebase shows.

By moving the whole delivery step to one awaited backend call, we remove the unreliable piece that is currently failing.

---

## Validation plan
After implementation, I will verify end-to-end in this order:

1. Confirm a fresh `push_tokens` row exists for the logged-in Android device
2. Trigger a backend diagnostic push and confirm backend logs show token usage
3. Apply leave and verify:
   - bell notification created
   - backend dispatcher called
   - push sender logs delivery attempt
4. Approve/reject leave and verify employee notification path
5. Check in / check out and verify manager/admin delivery
6. Repeat checks with app:
   - foreground
   - background
   - fully closed

---

## Important note about the native APK
This repo does not contain the Android project files, so native Gradle / manifest edits are not visible here.  
However, since tokens are already being generated and saved, the native Firebase wiring is likely already in place. The current blocker is the app-to-backend dispatch path.

After I implement the code-side fix, the updated project will still need to be pulled into the native shell and synced before rebuilding the APK.

## Technical details
- The dropped `on_notification_inserted` trigger is not the crash now, but it removed the only backend fallback
- The current helper uses non-awaited `supabase.functions.invoke(...)` calls inside a loop
- In a mobile WebView, that is exactly the kind of request pattern that can silently fail or get dropped
- Manual backend push success proves FCM credentials are usable
- Missing automatic function logs proves real app events are not reliably reaching the push backend
