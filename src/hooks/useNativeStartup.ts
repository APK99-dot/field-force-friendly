import { useEffect } from "react";

/**
 * On native (Capacitor) platforms, request all hardware permissions
 * as soon as the app starts. This triggers Android system dialogs
 * so the WebView has access to camera, location, etc.
 */
export function useNativeStartup() {
  useEffect(() => {
    let cancelled = false;

    async function requestAllPermissions() {
      // Check if we're in a Capacitor native shell
      let isNativePlatform = false;
      try {
        const { Capacitor } = await import("@capacitor/core");
        isNativePlatform = Capacitor.isNativePlatform();
      } catch {
        return; // Not native, nothing to do
      }

      if (!isNativePlatform || cancelled) return;

      console.log("[NativeStartup] Requesting native permissions…");

      // 1. Location permission
      try {
        const { Geolocation } = await import("@capacitor/geolocation");
        const locPerm = await Geolocation.requestPermissions();
        console.log("[NativeStartup] Location permission:", locPerm.location);
      } catch (e) {
        console.warn("[NativeStartup] Location permission request failed:", e);
      }

      // 2. Camera permission
      try {
        const { Camera } = await import("@capacitor/camera");
        const camPerm = await Camera.requestPermissions();
        console.log("[NativeStartup] Camera permission:", camPerm.camera);
      } catch (e) {
        console.warn("[NativeStartup] Camera permission request failed:", e);
      }

      // 3. Microphone permission — prime getUserMedia so WebView allows it later
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        console.log("[NativeStartup] Microphone permission granted");
      } catch (e) {
        console.warn("[NativeStartup] Microphone permission request failed:", e);
      }
    }

    requestAllPermissions();

    return () => {
      cancelled = true;
    };
  }, []);
}
