

## Plan: Fix Android APK Crash on Notification Permission Grant

### Root Cause Analysis

The crash occurs because of a known Capacitor + remote-URL WebView issue on Android 13+. When the system notification permission dialog appears and the user taps "Allow":

1. Android may **recreate the Activity** after granting a runtime permission
2. This destroys and re-creates the WebView, but the `PushNotifications` plugin callback tries to resolve into the now-destroyed JavaScript context
3. Additionally, `PushNotifications.register()` is called synchronously right after `requestPermissions()` resolves, with no guard against the component/WebView being torn down

The current code has a single top-level try-catch but no guards for:
- Component unmount during the async permission flow
- Activity recreation between `requestPermissions()` and `register()`
- Null/undefined plugin responses

### Fix (single file: `src/hooks/usePushNotifications.ts`)

1. **Add an `unmounted` guard** -- track whether the effect has been cleaned up; bail out of every async step if true.

2. **Wrap each step individually in try-catch** -- `requestPermissions()`, `register()`, and each `addListener()` call get their own error boundaries so one failure doesn't cascade.

3. **Add a delay between permission grant and register()** -- a short `setTimeout` (500ms) gives Android time to finish Activity recreation before calling `register()`. This is the key fix for the crash.

4. **Guard the Supabase upsert** -- check that `userId` and `token.value` are truthy before attempting the database call inside the registration listener.

5. **Safely handle missing plugin** -- if the dynamic import of `@capacitor/push-notifications` fails (e.g. plugin not installed in native shell), log and return silently.

### What stays the same
- The hook signature and where it's called in `AppLayout.tsx` remain unchanged
- All listener types (registration, registrationError, pushNotificationReceived) remain
- The Supabase upsert logic remains the same, just with null guards

### Files Modified
- `src/hooks/usePushNotifications.ts` -- rewrite with defensive guards and delayed registration

