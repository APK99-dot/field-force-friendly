import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentPosition, isNative } from "@/utils/nativePermissions";
import {
  startBackgroundTracking,
  stopBackgroundTracking,
  type BgLocation,
} from "@/utils/backgroundGeolocation";
import { format } from "date-fns";

/**
 * Continuous, day-long GPS tracking.
 *
 * Behaviour:
 *  - Tracking is tied to the work day: it runs only while the user is
 *    Checked-In (check_in_time set) and NOT yet Checked-Out.
 *  - While active, the current location is captured and stored in
 *    `gps_tracking` so the full day's path can be replayed.
 *
 * Platform behaviour:
 *  - APK (Capacitor native): uses @capacitor-community/background-geolocation,
 *    a foreground service with a persistent notification that keeps emitting
 *    locations even when the app is closed/minimised — TRUE background
 *    tracking until the day ends. Requires "Allow all the time" permission.
 *  - PWA / web: best-effort foreground tracking via a timer. Browsers throttle
 *    or suspend timers when the tab is backgrounded, so pings only reliably
 *    continue while the app is open/visible.
 */

// Ping every 90 seconds while a work day is active (web foreground fallback).
const PING_INTERVAL_MS = 90 * 1000;
// Re-check attendance status this often (so we auto-start/stop around the day).
const STATUS_POLL_MS = 60 * 1000;
// Minimum spacing between DB inserts from the native watcher (avoid flooding
// when the OS reports rapidly). One row per ~60s is plenty for a day trail.
const NATIVE_MIN_INSERT_MS = 60 * 1000;

export function useContinuousGPS(userId?: string | null) {
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const trackingRef = useRef(false);
  const capturingRef = useRef(false);
  const lastNativeInsertRef = useRef(0);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    const native = isNative();

    const insertPoint = async (
      lat: number,
      lng: number,
      accuracy: number | null,
    ) => {
      try {
        await supabase.from("gps_tracking").insert({
          user_id: userId,
          latitude: lat,
          longitude: lng,
          accuracy: accuracy ?? null,
          date: format(new Date(), "yyyy-MM-dd"),
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.warn("GPS insert failed:", err);
      }
    };

    // --- Web foreground fallback ---------------------------------------
    const capture = async () => {
      if (capturingRef.current) return; // avoid overlap if a fix is slow
      capturingRef.current = true;
      try {
        const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 20000 });
        if (cancelled) return;
        await insertPoint(pos.latitude, pos.longitude, pos.accuracy ?? null);
      } catch (err) {
        console.warn("GPS ping failed:", err);
      } finally {
        capturingRef.current = false;
      }
    };

    // --- Native watcher callback ---------------------------------------
    const onNativeLocation = (loc: BgLocation) => {
      if (cancelled) return;
      const now = Date.now();
      if (now - lastNativeInsertRef.current < NATIVE_MIN_INSERT_MS) return;
      lastNativeInsertRef.current = now;
      insertPoint(loc.latitude, loc.longitude, loc.accuracy);
    };

    const startTracking = async () => {
      if (trackingRef.current) return;
      trackingRef.current = true;

      if (native) {
        // Try true background tracking first. If the plugin isn't available,
        // fall back to the foreground timer loop.
        const started = await startBackgroundTracking(onNativeLocation, (err) => {
          console.warn("[BgGeo] permission/error:", err);
        });
        if (started) return;
      }

      capture(); // immediate first ping
      pingTimer.current = setInterval(capture, PING_INTERVAL_MS);
    };

    const stopTracking = async () => {
      if (!trackingRef.current) return;
      trackingRef.current = false;
      if (native) await stopBackgroundTracking();
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
