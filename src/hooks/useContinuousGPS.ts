import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentPosition, isNative } from "@/utils/nativePermissions";
import { format } from "date-fns";

/**
 * Continuous, day-long GPS tracking.
 *
 * Behaviour:
 *  - Tracking is tied to the work day: it runs only while the user is
 *    Checked-In (check_in_time set) and NOT yet Checked-Out.
 *  - While active, the current location is captured on a fixed interval
 *    and stored in `gps_tracking` so the full day's path can be replayed.
 *
 * Platform notes:
 *  - PWA / web: this is *best-effort foreground* tracking. Browsers throttle
 *    or suspend timers when the tab is backgrounded, so pings only reliably
 *    continue while the app is open/visible.
 *  - APK (Capacitor native): the same foreground loop runs, but TRUE background
 *    tracking (app closed/minimised) additionally requires a native background
 *    geolocation plugin + persistent notification + "Allow all the time"
 *    permission. That plugin is NOT yet integrated.
 */

// Ping every 90 seconds while a work day is active.
const PING_INTERVAL_MS = 90 * 1000;
// Re-check attendance status this often (so we auto-start/stop around the day).
const STATUS_POLL_MS = 60 * 1000;

export function useContinuousGPS(userId?: string | null) {
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const trackingRef = useRef(false);
  const capturingRef = useRef(false);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const capture = async () => {
      if (capturingRef.current) return; // avoid overlap if a fix is slow
      capturingRef.current = true;
      try {
        const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 20000 });
        if (cancelled) return;
        await supabase.from("gps_tracking").insert({
          user_id: userId,
          latitude: pos.latitude,
          longitude: pos.longitude,
          accuracy: pos.accuracy ?? null,
          date: format(new Date(), "yyyy-MM-dd"),
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        // Silent — a single failed fix should not break the day-long loop.
        console.warn("GPS ping failed:", err);
      } finally {
        capturingRef.current = false;
      }
    };

    const startTracking = () => {
      if (trackingRef.current) return;
      trackingRef.current = true;
      capture(); // immediate first ping
      pingTimer.current = setInterval(capture, PING_INTERVAL_MS);
    };

    const stopTracking = () => {
      if (!trackingRef.current) return;
      trackingRef.current = false;
      if (pingTimer.current) {
        clearInterval(pingTimer.current);
        pingTimer.current = null;
      }
    };

    const syncStatus = async () => {
      try {
        const today = format(new Date(), "yyyy-MM-dd");
        const { data } = await supabase
          .from("attendance")
          .select("check_in_time, check_out_time")
          .eq("user_id", userId)
          .eq("date", today)
          .maybeSingle();

        const active = !!data?.check_in_time && !data?.check_out_time;
        if (active) startTracking();
        else stopTracking();
      } catch (err) {
        console.warn("GPS status sync failed:", err);
      }
    };

    // Initial + polling status checks so tracking auto-starts on check-in
    // and auto-stops on check-out without a page reload.
    syncStatus();
    statusTimer.current = setInterval(syncStatus, STATUS_POLL_MS);

    // Re-sync when the app returns to the foreground.
    const onVisible = () => {
      if (document.visibilityState === "visible") syncStatus();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (statusTimer.current) clearInterval(statusTimer.current);
      stopTracking();
    };
  }, [userId]);

  // Expose native flag purely for callers that want to warn about background limits.
  return { isNative: isNative() };
}
