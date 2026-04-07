import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

const FCM_FLAG = "fcm_needs_register";

/**
 * Registers FCM push token on native Android devices.
 * On web this is a no-op.
 *
 * Decouples permission request from FCM registration to avoid
 * Android 13+ Activity recreation crash.
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
      // Dynamic import with guard
      let PushNotifications: any;
      try {
        const mod = await import("@capacitor/push-notifications");
        PushNotifications = mod.PushNotifications;
      } catch (e) {
        console.warn("Push notifications plugin not available:", e);
        return;
      }

      if (isUnmounted.current) return;

      // Set up listeners BEFORE any permission/register calls
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
                  { user_id: userId, token: token.value, platform: "android" } as any,
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
          (err: any) => console.error("Push registration error:", err)
        );
      } catch (e) {
        console.warn("Failed to add registrationError listener:", e);
      }

      try {
        notifListener = await PushNotifications.addListener(
          "pushNotificationReceived",
          (notification: any) => console.log("Push received in foreground:", notification)
        );
      } catch (e) {
        console.warn("Failed to add pushNotificationReceived listener:", e);
      }

      if (isUnmounted.current) return;

      // Check if we have a deferred registration from a previous lifecycle
      const needsDeferredRegister = localStorage.getItem(FCM_FLAG) === "true";
      if (needsDeferredRegister) {
        localStorage.removeItem(FCM_FLAG);
        console.log("Deferred FCM registration detected, registering now...");
        try {
          await PushNotifications.register();
        } catch (e) {
          console.warn("Deferred PushNotifications.register() failed:", e);
        }
        return; // Done — token will arrive via the registration listener
      }

      // Check current permission status (does NOT trigger system dialog)
      let currentStatus: string | undefined;
      try {
        const result = await PushNotifications.checkPermissions();
        currentStatus = result?.receive;
      } catch (e) {
        console.warn("checkPermissions failed:", e);
        return;
      }

      if (isUnmounted.current) return;

      if (currentStatus === "granted") {
        // Permission already granted — safe to register directly
        try {
          await PushNotifications.register();
        } catch (e) {
          console.warn("PushNotifications.register() failed:", e);
        }
        return;
      }

      // Permission not yet granted — request it, but DO NOT register afterward.
      // Android 13+ may recreate the Activity after granting, destroying this context.
      try {
        const permResult = await PushNotifications.requestPermissions();
        if (permResult?.receive === "granted") {
          // Set flag so the NEXT mount (after Activity recreation) will register
          localStorage.setItem(FCM_FLAG, "true");
          console.log("Permission granted — FCM registration deferred to next mount");
        } else {
          console.log("Push notification permission not granted");
        }
      } catch (e) {
        console.warn("Push permission request failed:", e);
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
