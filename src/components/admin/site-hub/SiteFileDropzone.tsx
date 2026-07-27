import { useRef, useState } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { uploadSiteFile, isImageFile } from "@/utils/siteAttachments";

interface Props {
  siteId: string;
  kind: "document" | "photo";
  onUploaded: () => void;
  label: string;
  helper: string;
  accept?: string;
}

export default function SiteFileDropzone({ siteId, kind, onUploaded, label, helper, accept }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    // For photo kind, only accept images. Warn & skip others.
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
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (busy) return;
        if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
      }}
      className={`rounded-xl border-2 border-dashed p-5 sm:p-6 text-center transition-colors ${
        dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/20"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
      <UploadCloud className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{helper}</p>
      <Button
        type="button"
        size="sm"
        className="mt-3"
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
    </div>
  );
}
