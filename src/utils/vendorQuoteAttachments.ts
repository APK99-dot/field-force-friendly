import { supabase } from "@/integrations/supabase/client";

const BUCKET = "vendor-quote-attachments";

/**
 * Vendor quote attachments used to live in a public bucket, so older rows store a
 * full public URL while newer uploads store the bare object path. Both forms are
 * normalised back to the object path here.
 */
export function vendorQuoteObjectPath(urlOrPath: string): string {
  if (!urlOrPath) return "";
  const marker = `/${BUCKET}/`;
  const idx = urlOrPath.indexOf(marker);
  if (idx === -1) return urlOrPath.replace(/^\/+/, "");
  return decodeURIComponent(urlOrPath.slice(idx + marker.length).split("?")[0]);
}

/** Resolve a stored vendor quote attachment to a short-lived signed URL. */
export async function resolveVendorQuoteAttachmentUrl(urlOrPath: string): Promise<string> {
  const path = vendorQuoteObjectPath(urlOrPath);
  if (!path) return "";
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl || "";
}
