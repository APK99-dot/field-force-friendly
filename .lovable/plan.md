
## Plan: Fix Android Push Notifications End-to-End

### What I found
The push system is only partially broken:

1. **Device tokens are being saved**
   - `push_tokens` has recent Android token rows, so the APK is registering with FCM and sending tokens to the backend.

2. **The FCM backend function works**
   - A manual call to `send-push-notification` succeeded (`sent: 1`, `cleaned: 1`), which means:
   - `FCM_SERVICE_ACCOUNT_KEY` is actually being used
   - FCM delivery from the backend is functional
   - stale tokens are being cleaned up

3. **In-app notifications are being inserted**
   - Recent `notifications` rows exist for leave/check-in flows, so the bell icon path is working.

4. **The broken link is the automatic backend trigger path**
   - Notifications are inserted, but there are no corresponding automatic push-function executions/logs.
   - So the issue is not FCM itself — it is the current `notifications -> DB trigger -> send-push-notification` pipeline.

5. **Android tray delivery setup is incomplete**
   - The app uses `channel_id: "default"` in FCM payloads, but the client does not create that Android notification channel.
   - This can prevent reliable notification-drawer behavior on some Android devices.

6. **One requested event is still missing**
   - **Day End / check-out** push notification is not currently sent.

---

## Fix approach

### 1) Stop depending on the silent DB-trigger hop for push delivery
I will make push delivery happen explicitly from app-side notification helpers:

- Keep inserting rows into `notifications` so the **bell icon continues to work**
- Immediately invoke the backend push function for the same recipients
- This removes the unreliable trigger bridge from the critical path

This is the safest fix because:
- token storage already works
- the push function already works
- only the middle bridge is failing

### 2) Harden Android notification setup in the APK
Update the push hook to:

- create a **real Android notification channel** named `default`
- keep the deferred registration logic that avoids the Android permission crash
- add listener coverage for:
  - registration
  - registrationError
  - pushNotificationReceived
  - pushNotificationActionPerformed
- re-register safely when permission is already granted

### 3) Expand event coverage to match requested behavior
Ensure both **in-app + native push** happen for:

- Leave applied → manager + admins
- Leave approved/rejected → employee
- Check-in / Day Start → manager + admins
- Check-out / Day End → manager + admins
- Regularisation request → manager + admins
- Regularisation approved/rejected → employee

### 4) Avoid duplicate or stale delivery
- Keep stale-token cleanup in the edge function
- Make notification sending go through one shared helper so all event flows behave consistently
- Remove dependence on the trigger path so pushes do not silently fail

---

## Implementation steps

### Step 1: Centralize “insert notification + send push”
Update `src/utils/notificationHelpers.ts` to provide a single reusable helper that:

- inserts notification rows into `notifications`
- calls the backend push function for each recipient
- logs per-recipient failures without breaking the in-app notification insert

This becomes the single source of truth for notification delivery.

### Step 2: Replace direct `notifications.insert(...)` calls
Update all places that currently only write notification rows so they use the shared helper instead.

Files to update:
- `src/components/LeaveApplicationModal.tsx`
- `src/components/RegularizationRequestModal.tsx`
- `src/hooks/useAttendance.ts`
- `src/pages/AttendanceManagement.tsx`
- `src/pages/PendingApprovals.tsx`

### Step 3: Add missing Day End notification
Update `src/hooks/useAttendance.ts` so `checkOut()` also notifies manager + admins.

### Step 4: Create Android notification channel
Update `src/hooks/usePushNotifications.ts` to:
- create channel `default`
- register listeners safely
- preserve deferred registration after Android permission grant
- handle notification taps cleanly

### Step 5: Neutralize the unreliable trigger path
I will remove or stop relying on the `on_notification_inserted` trigger path so push delivery does not depend on the failing database hop.

This prevents confusion and future duplicate pushes once explicit delivery is in place.

---

## Files involved

### Frontend
- `src/hooks/usePushNotifications.ts`
- `src/utils/notificationHelpers.ts`
- `src/hooks/useAttendance.ts`
- `src/components/LeaveApplicationModal.tsx`
- `src/components/RegularizationRequestModal.tsx`
- `src/pages/AttendanceManagement.tsx`
- `src/pages/PendingApprovals.tsx`

### Backend
- migration to disable/remove trigger dependency:
  - `on_notification_inserted`
  - `notify_push_on_insert()`

### Existing backend function kept
- `supabase/functions/send-push-notification/index.ts`

---

## Technical details

### Why this is the right fix
The investigation shows:

```text
APK token registration: working
notifications table inserts: working
FCM backend send: working
automatic DB-trigger dispatch: failing
```

So the reliable fix is to connect the already-working pieces directly.

### Android drawer behavior
For background/closed delivery, the payload already includes a `notification` object, which is correct for system-tray display. I will add the missing Android channel setup so the device can present those notifications consistently.

### Real-time bell icon behavior
Nothing will be removed from the in-app system. Notification rows will still be inserted exactly as before, so bell icon behavior remains intact.

### Expected result after implementation
When the app is in foreground, background, or closed:

- bell icon still updates
- Android notification drawer shows native push alerts
- leave/check-in/check-out/regularisation events go to the right people
- employee approval/rejection messages reach the employee device

---

## Validation plan
After implementation, I will verify this flow end-to-end:

1. Log in on Android and confirm a `push_tokens` row is created/updated
2. Apply leave from employee account
3. Confirm manager/admin get:
   - bell icon notification
   - Android tray notification
4. Approve/reject leave
5. Confirm employee gets:
   - bell icon notification
   - Android tray notification
6. Start Day / End Day
7. Confirm manager/admin receive native push for both events
8. Repeat with app in:
   - foreground
   - background
   - fully closed
