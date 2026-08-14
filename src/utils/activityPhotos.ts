import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { compressImage } from "@/utils/imageCompressor";
import { getCurrentPosition } from "@/utils/nativePermissions";
import { stampGeo } from "@/utils/geoStamp";
import type { ActivityPhotoEntry } from "@/hooks/useActivities";

const BUCKET = "activity-photos";

// Cache signed URLs by storage path to avoid re-signing on every render
const signedUrlCache = new Map<string, { url: string; expires: number }>();

// The geo lookup now runs BEFORE the upload, because the caption is drawn into
// the pixels — so both legs are bounded. A phone that cannot get a fix, or a
// slow Nominatim, must not leave someone staring at a spinner after they took a
// photo. Whatever has arrived by the deadline is what gets stamped.
const GEO_FIX_TIMEOUT_MS = 8000;
const GEOCODE_TIMEOUT_MS = 4000;

/**
 * Reverse-geocode a coordinate to a street address. Never throws, and never
 * blocks for longer than GEOCODE_TIMEOUT_MS — a slow Nominatim must not hold up
 * a photo upload. Returns null when it cannot answer in time; coordinates alone
 * still make a usable stamp.
 *
 * Exported because attendance check-in photos stamp the same caption, and it
 * already has its own GPS fix from the check-in flow — so it needs the address
 * lookup without the position lookup that captureGeo does.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), GEOCODE_TIMEOUT_MS);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        { signal: ctrl.signal }
      );
      const geo = await res.json();
      return geo?.display_name || null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/**
 * Capture GPS + reverse-geocoded address for a photo. Never throws.
 */
async function captureGeo(): Promise<{ lat: number | null; lng: number | null; address: string | null }> {
  try {
    const pos = await getCurrentPosition({ timeout: GEO_FIX_TIMEOUT_MS });
    const address = await reverseGeocode(pos.latitude, pos.longitude);
    return { lat: pos.latitude, lng: pos.longitude, address };
  } catch {
    return { lat: null, lng: null, address: null };
  }
}

/**
 * Compress + upload a single image blob to the activity-photos bucket,
 * tagging it with the current GPS location and timestamp.
 * Returns the stored entry (url holds the storage path).
 */
export async function uploadActivityPhoto(blob: Blob): Promise<ActivityPhotoEntry> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Where and when, resolved up front so it can be drawn into the image.
  const at = new Date();
  const geo = await captureGeo();

  let toUpload: Blob = blob;
  try {
    toUpload = await compressImage(blob, 1280, 0.7);
  } catch {
    /* fall back to original */
  }

  // Stamp after compression, never before: the resize would soften the caption
  // into something unreadable at small sizes.
  try {
    toUpload = await stampGeo(toUpload, {
      at,
      address: geo.address,
      lat: geo.lat,
      lng: geo.lng,
    });
  } catch (e) {
    // A failed stamp must not cost someone the photo they just took.
    console.warn("Geo stamp failed; uploading the photo unstamped:", e);
  }

  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, toUpload, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;

  return {
    url: path,
    // The same instant that is printed on the image, so the caption and the
    // record can never disagree.
    at: at.toISOString(),
    lat: geo.lat,
    lng: geo.lng,
    address: geo.address,
  };
}

/**
 * Resolve a stored photo path (or legacy full URL) to a usable signed URL.
 */
export async function resolveActivityPhotoUrl(pathOrUrl: string): Promise<string> {
  if (!pathOrUrl) return "";
  // Legacy/public full URLs - return as-is
  if (/^https?:\/\//i.test(pathOrUrl) && !pathOrUrl.includes("/object/sign/")) {
    return pathOrUrl;
  }
  // Extract path from a previously signed URL if needed
  let path = pathOrUrl;
  const m = pathOrUrl.match(/activity-photos\/(.+?)(\?|$)/);
  if (m) path = m[1];

  const cached = signedUrlCache.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;

  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (data?.signedUrl) {
    signedUrlCache.set(path, { url: data.signedUrl, expires: Date.now() + 50 * 60 * 1000 });
    return data.signedUrl;
  }
  return "";
}

export async function deleteActivityPhoto(activityId: string, storageKey: string): Promise<void> {
  const { data, error: readError } = await supabase
    .from("activity_events")
    .select("photo_urls")
    .eq("id", activityId)
    .maybeSingle();
  if (readError) throw readError;

  const photos = Array.isArray(data?.photo_urls) ? data.photo_urls as unknown as ActivityPhotoEntry[] : [];
  const next = photos.filter((photo) => photo.url !== storageKey);
  const { error: updateError } = await supabase
    .from("activity_events")
    .update({ photo_urls: next as unknown as Json })
    .eq("id", activityId);
  if (updateError) throw updateError;

  if (!/^https?:\/\//i.test(storageKey)) {
    const match = storageKey.match(/activity-photos\/(.+?)(\?|$)/);
    const path = match ? match[1] : storageKey;
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    signedUrlCache.delete(path);
  }
}
