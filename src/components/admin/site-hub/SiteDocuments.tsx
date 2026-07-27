import { useState } from "react";
import { FileText, Download, Trash2, User, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getSiteAttachmentUrl, getSiteFileSignedUrl, deleteSiteFile } from "@/utils/siteAttachments";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import SiteFileDropzone from "./SiteFileDropzone";
import type { HubDocument } from "@/hooks/useSiteHub";

interface Props {
  siteId: string;
  documents: HubDocument[];
  onChanged: () => void;
}

function formatSize(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SiteDocuments({ siteId, documents, onChanged }: Props) {
  const [confirmDelete, setConfirmDelete] = useState<HubDocument | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { userId } = useCurrentUser();
  const { hasAdminAccess } = useAdminAccess();

  const canDelete = (d: HubDocument) =>
    d.source === "site_files" && !!d.id && (hasAdminAccess || (!!userId && d.uploadedById === userId));

  const openDoc = async (d: HubDocument) => {
    const url = d.source === "site_files"
      ? await getSiteFileSignedUrl(d.stored)
      : await getSiteAttachmentUrl(d.stored);
    if (url) window.open(url, "_blank");
    else toast.error("Could not open file");
  };

  const handleDelete = async () => {
    if (!confirmDelete?.id) return;
    setDeleting(true);
    try {
      await deleteSiteFile(confirmDelete.id, confirmDelete.stored);
      toast.success("Document deleted");
      onChanged();
    } catch (err: any) {
      toast.error(err.message ?? "Delete failed");
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-4">
      <SiteFileDropzone
        siteId={siteId}
        kind="document"
        onUploaded={onChanged}
        label="Drag & drop documents here"
        helper="or click to select multiple files (PDF, DOCX, XLSX, images…)"
      />

      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No documents uploaded yet.</p>
      ) : (
        <div className="rounded-xl border divide-y">
          {documents.map((d, i) => (
            <div key={d.id ?? `legacy-${i}`} className="flex items-start gap-3 p-3 hover:bg-muted/30 transition-colors">
              <FileText className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => openDoc(d)}
                  className="text-sm font-medium text-left text-foreground hover:text-primary hover:underline truncate w-full"
                >
                  {d.name}
                </button>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-muted-foreground">
                  {d.uploadedBy && (
                    <span className="flex items-center gap-1"><User className="h-3 w-3" />{d.uploadedBy}</span>
                  )}
                  {d.at && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(parseISO(d.at), "dd MMM yy, h:mm a")}
                    </span>
                  )}
                  {d.size ? <span>{formatSize(d.size)}</span> : null}
                  {d.source === "legacy" ? <span className="italic">legacy</span> : null}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openDoc(d)} aria-label="Download">
                  <Download className="h-4 w-4" />
                </Button>
                {canDelete(d) && (
                  <Button
                    size="icon" variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setConfirmDelete(d)}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <span className="font-medium">{confirmDelete?.name}</span> from this site.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
