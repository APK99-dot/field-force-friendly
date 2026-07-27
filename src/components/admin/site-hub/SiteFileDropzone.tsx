import { useRef, useState } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { uploadSiteFile, isImageFile } from "@/utils/siteAttachments";

interface Props {
  siteId: string;
  kind: "document" | "photo";
  onUploaded: () => void;
  accept?: string;
  className?: string;
}

export default function SiteFileDropzone({ siteId, kind, onUploaded, accept, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    const filtered = kind === "photo" ? files.filter((f) => {
      if (!isImageFile(f)) { toast.error(`Skipped ${f.name} — not an image`); return false; }
      return true;
    }) : files;
    if (filtered.length === 0) return;

    setBusy(true);
    setProgress({ done: 0, total: filtered.length });
    let ok = 0;
    for (let i = 0; i < filtered.length; i++) {
      try {
        await uploadSiteFile(siteId, filtered[i], kind);
        ok++;
      } catch (err: any) {
        toast.error(`${filtered[i].name}: ${err.message ?? "Upload failed"}`);
      } finally {
        setProgress({ done: i + 1, total: filtered.length });
      }
    }
    setBusy(false);
    setProgress(null);
    if (ok > 0) {
      toast.success(`Uploaded ${ok} ${kind === "photo" ? "photo" : "file"}${ok === 1 ? "" : "s"}`);
      onUploaded();
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
      <Button
        type="button"
        size="sm"
        className={className}
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        {busy ? (
          <>
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            Uploading {progress ? `${progress.done}/${progress.total}` : "…"}
          </>
        ) : (
          <>
            <UploadCloud className="h-3.5 w-3.5 mr-1.5" />
            {kind === "photo" ? "Upload Photos" : "Upload Documents"}
          </>
        )}
      </Button>
    </>
  );
}
