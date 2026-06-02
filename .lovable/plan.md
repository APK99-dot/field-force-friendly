## Findings

- The hosted backend is healthy.
- The notification bell is receiving some rows, but not every recipient is being included for every event.
- Android APK push tokens exist for most users, but **Anand G Pai** and **Nikhil R** currently have no APK push token registered.
- No iPhone PWA web-push subscriptions are currently registered for any active user.
- The current attendance broadcast logic appears inconsistent with the requirement that all active members receive check-in/check-out notifications.

## Answer to your APK question

A new APK is **not always required** for server-side recipient fixes, notification bell fixes, and PWA/web-push fixes.

A new APK **is required** if the installed Android app does not contain the newer native push registration code, because only the APK can register its FCM token on that phone. Users without registered APK tokens will still see bell notifications in the app, but they will not get Android system notification banners.

## Plan

1. **Fix attendance recipient selection**
   - Ensure check-in and check-out notifications are sent to all active users except the person performing the action.
   - Keep the existing notification UI/design unchanged.

2. **Add push registration self-healing**
   - Improve Android APK registration so token registration happens immediately after permission is granted, not only on a later mount/resume.
   - Keep the existing resume refresh behavior.

3. **Use the backend registration path for iPhone PWA**
   - Adjust web-push subscription saving to use the existing secure backend function, so iPhone PWA subscriptions are saved reliably.
   - Keep Profile/Settings “Enable Notifications” behavior unchanged visually.

4. **Add a small debug signal in logs**
   - Make notification dispatch log the count of in-app rows, Android tokens, and iPhone/web subscriptions so future delivery issues can be diagnosed quickly.

5. **Validation**
   - Re-check database counts for notification rows, APK tokens, and web-push subscriptions after changes.
   - Confirm whether affected Android users need to open the current APK or install a newly generated APK depending on whether their app version contains the latest token-registration code.

## After implementation

- Android users should open the app once and allow notifications.
- If their installed APK is older than the push-token registration changes, regenerate/reinstall the APK.
- iPhone users must install the PWA from Safari, open it from the Home Screen, then tap Enable Notifications in Profile/Settings.