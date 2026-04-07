import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

/**
 * Registers FCM push token on native Android devices.
 * On web this is a no-op.
 *
 * Includes defensive guards for Android 13+ Activity recreation
 * that can occur after granting the notification permission.
 */
export function usePushNotifications(userId: string | undefined) {
  const isUnmounted = useRef(false);

  useEffect(() => {
    isUnmounted.current = false;

    if (!userId || !Capacitor.isNativePlatform()) return;

    let regListener: { remove: () => void } | undefined;
    let errListener: { remove: () => void } | undefined;
    let notifListener: { remove: () => void } | undefined;

    const init = async () => {
      // Step 1: Dynamic import with guard
      let PushNotifications: any;
      try {
        const mod = await import("@capacitor/push-notifications");
        PushNotifications = mod.PushNotifications;
      } catch (e) {
        console.warn("Push notifications plugin not available:", e);
        return;
      }

      if (isUnmounted.current) return;

      // Step 2: Set up listeners BEFORE requesting permission / registering
      try {
        regListener = await PushNotifications.addListener(
          "registration",
          async (token: any) => {
            if (isUnmounted.current) return;
            console.log("FCM token received:", token?.value);
            if (!token?.value || !userId) return;

            try {
              const { error } = await supabase
                .from("push_tokens" as any)
                .upsert(
                  {
                    user_id: userId,
                    token: token.value,
                    platform: "android",
                  } as any,
                  { onConflict: "token" }
                );
              if (error) console.error("Failed to save push token:", error);
            } catch (upsertErr) {
              console.error("Push token upsert threw:", upsertErr);
            }
          }
        );
      } catch (e) {
        console.warn("Failed to add registration listener:", e);
      }

      try {
        errListener = await PushNotifications.addListener(
          "registrationError",
          (err: any) => {
            console.error("Push registration error:", err);
          }
        );
      } catch (e) {
        console.warn("Failed to add registrationError listener:", e);
      }

      try {
        notifListener = await PushNotifications.addListener(
          "pushNotificationReceived",
          (notification: any) => {
            console.log("Push received in foreground:", notification);
          }
        );
      } catch (e) {
        console.warn("Failed to add pushNotificationReceived listener:", e);
      }

      if (isUnmounted.current) return;

      // Step 3: Request permission
      let permGranted = false;
      try {
        const permResult = await PushNotifications.requestPermissions();
        permGranted = permResult?.receive === "granted";
        if (!permGranted) {
          console.log("Push notification permission not granted");
          return;
        }
      } catch (e) {
        console.warn("Push permission request failed:", e);
        return;
      }

      if (isUnmounted.current) return;

      // Step 4: Delay registration to let Android finish Activity recreation
      // On Android 13+, granting a runtime permission can recreate the Activity.
      // A short delay prevents calling register() into a destroyed WebView context.
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (isUnmounted.current) return;

      // Step 5: Register with FCM
      try {
        await PushNotifications.register();
      } catch (e) {
        console.warn("PushNotifications.register() failed:", e);
      }
    };

    init();

    return () => {
      isUnmounted.current = true;
      try { regListener?.remove(); } catch (_) {}
      try { errListener?.remove(); } catch (_) {}
      try { notifListener?.remove(); } catch (_) {}
    };
  }, [userId]);
}
