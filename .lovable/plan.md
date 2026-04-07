

## Plan: Fix Push Notification Crash + Expand Notification Coverage

### Problem 1: APK Crash on "Allow" Notification Permission

**Root cause**: On Android 13+, granting the `POST_NOTIFICATIONS` runtime permission can trigger an Activity recreation. The Capacitor bridge's `getPermissionStates()` method crashes when the WebView context is destroyed mid-callback. The current 500ms delay is insufficient because the Activity recreation timing varies by device.

**Fix approach**: Completely decouple FCM registration from the permission grant flow. Instead of requesting permission and immediately registering in one async sequence, we:

1. **Check permission status first** — use `checkPermissions()` (not `requestPermissions()`) to see current state
2. **If already granted** — proceed directly to `register()` (no Activity recreation risk)
3. **If not granted** — call `requestPermissions()` but do NOT call `register()` afterward. Instead, set a flag in `localStorage` (`fcm_needs_register = true`)
4. **On next mount** (after Activity recreation completes and WebView is rebuilt) — detect the flag and call `register()` safely
5. **Wrap everything** in try-catch with `isUnmounted` guards

This eliminates the crash because `register()` never runs in the same lifecycle as `requestPermissions()`.

**File**: `src/hooks/usePushNotifications.ts` — rewrite

---

### Problem 2: Missing Notification Events

Currently only these events trigger notifications:
- Leave applied → manager only
- Leave approved/rejected → employee
- Regularization request → manager only  
- Regularization approved/rejected → employee
- Expense submit/approve/reject → various

**Missing events to add**:

#### A. Check-in notification to Manager + Admin
When an employee checks in (Start My Day), notify their reporting manager and all admin users.

**File**: `src/hooks/useAttendance.ts` — after successful check-in insert/update, insert notifications for manager + admins

#### B. Leave applied → notify Admin users too (currently only manager)
**File**: `src/components/LeaveApplicationModal.tsx` — after notifying manager, also notify all admin users

#### C. Regularization request → notify Admin users too (currently only manager)
**File**: `src/components/RegularizationRequestModal.tsx` — same pattern

#### D. Fallback to admins when no reporting manager
All notification points that target `reporting_manager_id` should fall back to admin users when manager is null.

**Implementation for admin lookup**: Create a reusable helper function:
```typescript
// src/utils/notificationHelpers.ts
async function getAdminUserIds(): Promise<string[]>
async function getNotificationRecipients(userId: string): Promise<string[]>
// Returns [managerId, ...adminIds], deduped
```

---

### Technical Details

#### Files to create:
- `src/utils/notificationHelpers.ts` — helper to fetch manager + admin user IDs for notification targeting

#### Files to modify:
- `src/hooks/usePushNotifications.ts` — decouple permission from registration using localStorage flag
- `src/hooks/useAttendance.ts` — add check-in notification to manager + admins
- `src/components/LeaveApplicationModal.tsx` — add admin notifications on leave apply
- `src/components/RegularizationRequestModal.tsx` — add admin notifications on regularization request
- `src/pages/PendingApprovals.tsx` — ensure leave/reg decision notifications already work (they do)
- `src/pages/AttendanceManagement.tsx` — ensure leave/reg decision notifications already work (they do)

#### No database changes needed
The `notifications` table and `push_tokens` table already exist. The DB trigger `on_notification_inserted` already fires the edge function for every notification insert. The `FCM_SERVICE_ACCOUNT_KEY` secret still needs to be provided by you for push delivery to work.

### Prerequisite reminder
You still need to provide the **FCM Service Account Key** secret for push notifications to actually deliver to Android devices. Without it, bell icon notifications work but native push won't fire.

