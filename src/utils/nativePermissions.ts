import { Capacitor } from '@capacitor/core';
import { Geolocation as CapGeolocation } from '@capacitor/geolocation';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';

export const isNative = () => Capacitor.isNativePlatform();

/** Get current position — uses Capacitor plugin on native, browser API on web */
export async function getCurrentPosition(options?: { enableHighAccuracy?: boolean; timeout?: number }) {
  const opts = { enableHighAccuracy: true, timeout: 10000, ...options };

  if (isNative()) {
    const pos = await CapGeolocation.getCurrentPosition({
      enableHighAccuracy: opts.enableHighAccuracy,
      timeout: opts.timeout,
    });
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
    };
  }

  // Web fallback
  const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: opts.enableHighAccuracy,
      timeout: opts.timeout,
    })
  );
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
  };
}

/** Take a photo — uses Capacitor Camera on native, returns null on web (web uses CameraCapture component) */
export async function takeNativePhoto(): Promise<Blob | null> {
  if (!isNative()) return null;

  const image = await CapCamera.getPhoto({
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
  return null;
}

/** Request all needed permissions on native */
export async function requestNativePermissions() {
  if (!isNative()) return;

  try {
    await CapGeolocation.requestPermissions();
  } catch (e) {
    console.warn('Geolocation permission request failed:', e);
  }

  try {
    await CapCamera.requestPermissions();
  } catch (e) {
    console.warn('Camera permission request failed:', e);
  }
}
