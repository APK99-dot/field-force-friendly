import { registerPlugin } from "@capacitor/core";
import { isNative } from "@/utils/nativePermissions";

/**
 * Native background geolocation bridge (Android APK).
 *
 * Uses @capacitor-community/background-geolocation, which runs a foreground
 * service with a persistent notification and keeps emitting locations even
 * when the app is closed / minimised — until the watcher is explicitly
 * removed (i.e. when the work day ends).
 *
 * On web (PWA) this module is a no-op; the caller falls back to the
 * best-effort foreground interval loop instead.
 */

export interface BgLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  time: number | null;
}

interface BackgroundGeolocationPlugin {
  addWatcher(
    options: {
      backgroundMessage?: string;
      backgroundTitle?: string;
      requestPermissions?: boolean;
      stale?: boolean;
      distanceFilter?: number;
    },
    callback: (
      position?: {
        latitude: number;
        longitude: number;
        accuracy: number;
        time: number | null;
      },
      error?: { code: string; message: string },
    ) => void,
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
}

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>(
  "BackgroundGeolocation",
);

let watcherId: string | null = null;

/**
 * Start the native foreground-service watcher. `onLocation` is invoked for
 * every location the OS reports. Returns true if the native watcher was
 * started, false when not on a native platform (caller should fall back).
 */
export async function startBackgroundTracking(
  onLocation: (loc: BgLocation) => void,
  onError?: (err: { code: string; message: string }) => void,
): Promise<boolean> {
  if (!isNative()) return false;
  if (watcherId) return true; // already running

  try {
    watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: "Field Force tracking active",
        backgroundMessage: "Your location is recorded until you end the day.",
        requestPermissions: true,
        stale: false,
        // Record a new point roughly every ~30m of movement. The OS still
        // reports periodically while stationary so a full trail is captured.
        distanceFilter: 30,
      },
      (position, error) => {
        if (error) {
          if (error.code === "NOT_AUTHORIZED") {
            // Permission missing — surface so caller can prompt the user.
            onError?.(error);
          }
          return;
        }
        if (!position) return;
        onLocation({
          latitude: position.latitude,
          longitude: position.longitude,
          accuracy: position.accuracy ?? null,
          time: position.time ?? Date.now(),
        });
      },
    );
    return true;
  } catch (err) {
    console.warn("[BgGeo] Failed to start background watcher:", err);
    watcherId = null;
    return false;
  }
}

/** Stop the native watcher and tear down the foreground service/notification. */
export async function stopBackgroundTracking(): Promise<void> {
  if (!watcherId) return;
  try {
    await BackgroundGeolocation.removeWatcher({ id: watcherId });
  } catch (err) {
    console.warn("[BgGeo] Failed to remove background watcher:", err);
  } finally {
    watcherId = null;
  }
}

export function isBackgroundTrackingActive(): boolean {
  return watcherId !== null;
}

/** Open the OS app settings so the user can grant "Allow all the time". */
export async function openLocationSettings(): Promise<void> {
  if (!isNative()) return;
  try {
    await BackgroundGeolocation.openSettings();
  } catch {
    /* ignore */
  }
}
