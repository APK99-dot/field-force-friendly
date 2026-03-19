/**
 * Platform-aware permission & hardware helpers.
 * Works in three contexts:
 *   1. Pure web browser
 *   2. Capacitor local (plugins available)
 *   3. Capacitor remote-URL WebView (plugins may NOT be bridged)
 *
 * Strategy: always try native plugin first, catch errors, fall back to web API.
 */

let _isNativeCached: boolean | null = null;

/** Check if running inside a Capacitor native shell */
export function isNative(): boolean {
  if (_isNativeCached !== null) return _isNativeCached;
  try {
    // Dynamic check — avoids import errors if @capacitor/core isn't resolved
    const { Capacitor } = require('@capacitor/core');
    _isNativeCached = Capacitor.isNativePlatform();
  } catch {
    _isNativeCached = false;
  }
  return _isNativeCached;
}

/** Try to use Capacitor Geolocation plugin */
async function nativeGetPosition(opts: { enableHighAccuracy: boolean; timeout: number }) {
  const { Geolocation } = await import('@capacitor/geolocation');
  // Request permission first (required on Android)
  const permResult = await Geolocation.requestPermissions();
  if (permResult.location === 'denied') {
    throw new Error('Location permission denied by user');
  }
  const pos = await Geolocation.getCurrentPosition({
    enableHighAccuracy: opts.enableHighAccuracy,
    timeout: opts.timeout,
  });
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
  };
}

/** Web fallback for geolocation */
function webGetPosition(opts: { enableHighAccuracy: boolean; timeout: number }): Promise<{ latitude: number; longitude: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error('Geolocation not supported'));
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => reject(err),
      {
        enableHighAccuracy: opts.enableHighAccuracy,
        timeout: opts.timeout,
      }
    );
  });
}

/** Get current position — tries native plugin, falls back to web API */
export async function getCurrentPosition(options?: { enableHighAccuracy?: boolean; timeout?: number }) {
  const opts = { enableHighAccuracy: true, timeout: 15000, ...options };

  // Try native plugin first
  if (isNative()) {
    try {
      return await nativeGetPosition(opts);
    } catch (nativeErr) {
      console.warn('Native geolocation failed, falling back to web API:', nativeErr);
    }
  }

  // Web fallback (also used when native plugin fails)
  return webGetPosition(opts);
}

/** Take a photo — uses Capacitor Camera on native, returns null on web (web uses CameraCapture component) */
export async function takeNativePhoto(): Promise<Blob | null> {
  if (!isNative()) return null;

  try {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    
    // Request permission first
    const permResult = await Camera.requestPermissions();
    if (permResult.camera === 'denied') {
      console.warn('Camera permission denied');
      return null;
    }

    const image = await Camera.getPhoto({
      quality: 85,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      width: 640,
      height: 480,
    });

    if (image.webPath) {
      const response = await fetch(image.webPath);
      return await response.blob();
    }
  } catch (err) {
    console.warn('Native camera failed:', err);
  }
  return null;
}

/** Request microphone permission — tries web Permissions API, falls back gracefully */
export async function requestMicrophonePermission(): Promise<'granted' | 'denied' | 'prompt'> {
  // On Android WebView (Capacitor), navigator.permissions.query for 'microphone'
  // often throws or returns incorrect results. Skip it and go straight to getUserMedia.
  
  // Check via Permissions API only on non-native platforms
  if (!isNative()) {
    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (status.state === 'denied') return 'denied';
      if (status.state === 'granted') return 'granted';
    } catch {
      // Permissions API not supported for microphone in some browsers — continue
    }
  }

  // Actually request by getting a stream briefly — this is the reliable method on Android WebView
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return 'granted';
  } catch (err: any) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      return 'denied';
    }
    // On Android WebView, other errors like NotFoundError or AbortError
    // can occur even when permission is granted (e.g. no audio device found in emulator).
    // Don't treat these as "denied" — return 'prompt' so the caller can still try.
    console.warn('Microphone permission check encountered non-permission error:', err.name, err.message);
    return 'prompt';
  }
}

/** Request all needed permissions — tries native, silently skips on failure */
export async function requestNativePermissions() {
  // Try native geolocation permission
  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    await Geolocation.requestPermissions();
  } catch (e) {
    console.warn('Native geolocation permission request skipped:', e);
  }

  // Try native camera permission
  try {
    const { Camera } = await import('@capacitor/camera');
    await Camera.requestPermissions();
  } catch (e) {
    console.warn('Native camera permission request skipped:', e);
  }
}
