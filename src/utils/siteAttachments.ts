import { supabase } from "@/integrations/supabase/client";

const BUCKET = "site-attachments";

export async function uploadSiteAttachment(file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  return `${path}|${file.name}`;
}

export function attachmentName(stored: string): string {
  const [, name] = stored.split("|");
  return name || stored.split("/").pop() || stored;
}

export function attachmentPath(stored: string): string {
  return stored.split("|")[0];
}

export async function getSiteAttachmentUrl(stored: string): Promise<string | null> {
  const path = attachmentPath(stored);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}

export async function removeSiteAttachment(stored: string): Promise<void> {
  const path = attachmentPath(stored);
  await supabase.storage.from(BUCKET).remove([path]);
}

const IMAGE_MIME_OR_EXT = /^image\/|\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)$/i;

export function isImageFile(file: { type?: string; name: string }): boolean {
  return IMAGE_MIME_OR_EXT.test(file.type || "") || IMAGE_MIME_OR_EXT.test(file.name);
}

/**
 * Upload a file for a site and register it in the site_files table.
 * Returns the created site_files row id.
 */
export async function uploadSiteFile(
  siteId: string,
  file: File,
  kind: "document" | "photo",
): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const ext = file.name.split(".").pop() || "bin";
  const storageKey = `${siteId}/${kind}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(storageKey, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (upErr) throw upErr;

  const { data, error } = await supabase
    .from("site_files")
    .insert({
      site_id: siteId,
      kind,
      storage_key: storageKey,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || null,
      uploaded_by: user.id,
    })
    .select("id")
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([storageKey]);
    throw error;
  }
  return data.id;
}

export async function getSiteFileSignedUrl(storageKey: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storageKey, 3600);
  if (error) return null;
  return data.signedUrl;
}

export async function deleteSiteFile(id: string, storageKey: string): Promise<void> {
  const { error } = await supabase.from("site_files").delete().eq("id", id);
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([storageKey]).catch(() => {});
}

export async function renameSiteFile(id: string, newName: string): Promise<void> {
  const { error } = await supabase.from("site_files").update({ file_name: newName }).eq("id", id);
  if (error) throw error;
}
