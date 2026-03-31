import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

/**
 * Registers FCM push token on native Android devices.
 * On web this is a no-op.
 */
export function usePushNotifications(userId: string | undefined) {
  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return;

    let cleanup: (() => void) | undefined;

    const init = async () => {
      try {
        // Dynamic import so web builds don't fail
        const { PushNotifications } = await import(
          "@capacitor/push-notifications"
        );

        // Request permission
        const permResult = await PushNotifications.requestPermissions();
        if (permResult.receive !== "granted") {
          console.log("Push notification permission not granted");
          return;
        }

        // Register with FCM
        await PushNotifications.register();

        // Listen for registration success
        const regListener = await PushNotifications.addListener(
          "registration",
          async (token) => {
            console.log("FCM token received:", token.value);
            // Upsert token — ON CONFLICT on unique token column
            const { error } = await supabase.from("push_tokens" as any).upsert(
              {
                user_id: userId,
                token: token.value,
                platform: "android",
              } as any,
              { onConflict: "token" }
            );
            if (error) console.error("Failed to save push token:", error);
          }
        );

        // Handle registration errors
        const errListener = await PushNotifications.addListener(
          "registrationError",
          (err) => {
            console.error("Push registration error:", err);
          }
        );

        // Handle foreground notifications (optional — show toast or ignore)
        const notifListener = await PushNotifications.addListener(
          "pushNotificationReceived",
          (notification) => {
            console.log("Push received in foreground:", notification);
          }
        );

        cleanup = () => {
          regListener.remove();
          errListener.remove();
          notifListener.remove();
        };
      } catch (e) {
        console.warn("Push notifications not available:", e);
      }
    };

    init();

    return () => {
      cleanup?.();
    };
  }, [userId]);
}
