import { useState } from "react";
import { FileText, Download, Trash2, User, Clock, Pencil, Eye } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { getSiteAttachmentUrl, getSiteFileSignedUrl, deleteSiteFile, renameSiteFile } from "@/utils/siteAttachments";
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
  const [renaming, setRenaming] = useState<HubDocument | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [savingRename, setSavingRename] = useState(false);
  const { userId } = useCurrentUser();
  const { hasAdminAccess } = useAdminAccess();

  const isOwnerOrAdmin = (d: HubDocument) =>
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

  const openRename = (d: HubDocument) => {
    setRenaming(d);
    setRenameValue(d.name);
  };

  const handleRename = async () => {
    if (!renaming?.id) return;
    const trimmed = renameValue.trim();
    if (!trimmed) { toast.error("Name cannot be empty"); return; }
    setSavingRename(true);
    try {
      await renameSiteFile(renaming.id, trimmed);
      toast.success("Renamed");
      onChanged();
      setRenaming(null);
    } catch (err: any) {
      toast.error(err.message ?? "Rename failed");
    } finally {
      setSavingRename(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {documents.length} {documents.length === 1 ? "document" : "documents"}
        </p>
        <SiteFileDropzone siteId={siteId} kind="document" onUploaded={onChanged} />
      </div>

      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center border rounded-xl">
          No documents uploaded yet.
        </p>
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
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openDoc(d)} aria-label="View">
                  <Eye className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openDoc(d)} aria-label="Download">
                  <Download className="h-4 w-4" />
                </Button>
                {isOwnerOrAdmin(d) && (
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openRename(d)} aria-label="Rename">
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                {isOwnerOrAdmin(d) && (
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

      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename document</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="File name"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)} disabled={savingRename}>Cancel</Button>
            <Button onClick={handleRename} disabled={savingRename}>
              {savingRename ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
