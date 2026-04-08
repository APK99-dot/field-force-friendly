import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

const FCM_FLAG = "fcm_needs_register";

/**
 * Registers FCM push token on native Android devices.
 * Creates the required notification channel for Android 8+.
 * On web this is a no-op.
 */
export function usePushNotifications(userId: string | undefined) {
  const isUnmounted = useRef(false);

  useEffect(() => {
    isUnmounted.current = false;

    if (!userId || !Capacitor.isNativePlatform()) return;

    let regListener: { remove: () => void } | undefined;
    let errListener: { remove: () => void } | undefined;
    let notifListener: { remove: () => void } | undefined;
    let actionListener: { remove: () => void } | undefined;

    const init = async () => {
      let PushNotifications: any;
      try {
        const mod = await import("@capacitor/push-notifications");
        PushNotifications = mod.PushNotifications;
      } catch (e) {
        console.warn("Push notifications plugin not available:", e);
        return;
      }

      if (isUnmounted.current) return;

      // Create the Android notification channel (required for Android 8+)
      try {
        await PushNotifications.createChannel({
          id: "default",
          name: "Default Notifications",
          description: "General app notifications",
          importance: 5, // MAX
          visibility: 1, // PUBLIC
          sound: "default",
          vibration: true,
        });
        console.log("Notification channel 'default' created");
      } catch (e) {
        // createChannel may not exist on iOS or older plugin versions
        console.warn("createChannel not available:", e);
      }

      // Registration listener — saves FCM token to backend
      try {
        regListener = await PushNotifications.addListener(
          "registration",
          async (token: any) => {
            if (isUnmounted.current) return;
            console.log("FCM token received:", token?.value?.substring(0, 20) + "...");
            if (!token?.value || !userId) return;
            try {
              const { error } = await supabase
                .from("push_tokens" as any)
                .upsert(
                  { user_id: userId, token: token.value, platform: "android" } as any,
                  { onConflict: "token" }
                );
              if (error) console.error("Failed to save push token:", error);
              else console.log("Push token saved successfully");
            } catch (upsertErr) {
              console.error("Push token upsert threw:", upsertErr);
            }
          }
        );
      } catch (e) {
        console.warn("Failed to add registration listener:", e);
      }

      // Error listener
      try {
        errListener = await PushNotifications.addListener(
          "registrationError",
          (err: any) => console.error("Push registration error:", err)
        );
      } catch (e) {
        console.warn("Failed to add registrationError listener:", e);
      }

      // Foreground notification listener
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

      // Notification tap listener
      try {
        actionListener = await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (action: any) => {
            console.log("Push notification tapped:", action);
          }
        );
      } catch (e) {
        console.warn("Failed to add pushNotificationActionPerformed listener:", e);
      }

      if (isUnmounted.current) return;

      // Deferred registration from previous lifecycle (Android 13+ Activity recreation)
      const needsDeferredRegister = localStorage.getItem(FCM_FLAG) === "true";
      if (needsDeferredRegister) {
        localStorage.removeItem(FCM_FLAG);
        console.log("Deferred FCM registration, registering now...");
        try {
          await PushNotifications.register();
        } catch (e) {
          console.warn("Deferred PushNotifications.register() failed:", e);
        }
        return;
      }

      // Check current permission status
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
        try {
          await PushNotifications.register();
        } catch (e) {
          console.warn("PushNotifications.register() failed:", e);
        }
        return;
      }

      // Request permission — DO NOT register immediately on Android 13+
      try {
        const permResult = await PushNotifications.requestPermissions();
        if (permResult?.receive === "granted") {
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
      try { actionListener?.remove(); } catch (_) {}
    };
  }, [userId]);
}
