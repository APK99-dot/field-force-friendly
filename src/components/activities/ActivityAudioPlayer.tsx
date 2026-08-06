import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "activity-audio";

/** Extracts the storage object path from a stored public URL or raw path. */
export function activityAudioObjectPath(urlOrPath: string): string {
  if (!urlOrPath) return "";
  const marker = `/${BUCKET}/`;
  const idx = urlOrPath.indexOf(marker);
  if (idx === -1) return urlOrPath.replace(/^\/+/, "");
  return decodeURIComponent(urlOrPath.slice(idx + marker.length).split("?")[0]);
}

/**
 * The activity-audio bucket is private (voice notes are personal data), so the
 * player resolves a short-lived signed URL instead of using a public URL.
 */
export function ActivityAudioPlayer({ url, className }: { url: string; className?: string }) {
  const [src, setSrc] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const path = activityAudioObjectPath(url);
    if (!path) return;
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (!cancelled && data?.signedUrl) setSrc(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!src) {
    return <div className={className || "h-8 text-xs text-muted-foreground"}>Loading audio…</div>;
  }

  return (
    <audio controls className={className || "h-8 w-full max-w-[240px]"} preload="metadata">
      <source
        src={src}
        type={url.endsWith(".m4a") ? "audio/mp4" : url.endsWith(".ogg") ? "audio/ogg" : "audio/webm"}
      />
    </audio>
  );
}
