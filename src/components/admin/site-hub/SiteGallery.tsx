import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ImageIcon, User, Clock, Trash2, Download } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { deleteActivityPhoto, resolveActivityPhotoUrl } from "@/utils/activityPhotos";
import { getSiteAttachmentUrl, deleteSiteFile, deleteLegacySiteAttachment } from "@/utils/siteAttachments";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useProfilePermissions } from "@/hooks/useProfilePermissions";
import SiteFileDropzone from "./SiteFileDropzone";
import type { HubGalleryPhoto } from "@/hooks/useSiteHub";

async function resolve(photo: HubGalleryPhoto): Promise<string> {
  if (photo.kind === "activity") return resolveActivityPhotoUrl(photo.storageKey);
  return (await getSiteAttachmentUrl(photo.storageKey)) || "";
}

interface GalleryThumbProps {
  photo: HubGalleryPhoto;
  onOpen: (photo: HubGalleryPhoto, url: string) => void;
  onActivityClick?: (activityId: string) => void;
  canDelete: boolean;
  onDelete: (photo: HubGalleryPhoto) => void;
}

function GalleryThumb({ photo, onOpen, onActivityClick, canDelete, onDelete }: GalleryThumbProps) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    resolve(photo).then((u) => { if (active) setUrl(u); });
    return () => { active = false; };
  }, [photo]);

  return (
    <div className="group rounded-lg overflow-hidden border bg-card flex flex-col relative">
      {canDelete && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(photo); }}
          className="absolute top-1.5 right-1.5 z-10 rounded-full bg-background/90 border p-1 shadow-sm transition-colors hover:bg-destructive hover:text-destructive-foreground"
          aria-label="Delete photo"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={() => url && onOpen(photo, url)}
        className="relative aspect-square bg-muted overflow-hidden"
      >
        {url ? (
          <img src={url} alt={photo.label || "Site photo"} loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-105" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground">
            <ImageIcon className="h-6 w-6" />
          </div>
        )}
      </button>
      <div className="p-2 space-y-1">
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate">{photo.uploadedBy}</span>
        </div>
        {photo.at && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0" />
            <span>{format(parseISO(photo.at), "dd MMM yy, h:mm a")}</span>
          </div>
        )}
        {photo.activityCode && (
          <button
            type="button"
            onClick={() => photo.activityId && onActivityClick?.(photo.activityId)}
            className="w-full text-left"
          >
            <Badge variant="secondary" className="text-[10px] font-mono cursor-pointer hover:bg-primary hover:text-primary-foreground">
              {photo.activityCode}
            </Badge>
          </button>
        )}
      </div>
    </div>
  );
}

interface SiteGalleryProps {
  siteId: string;
  gallery: HubGalleryPhoto[];
  onActivityClick?: (activityId: string) => void;
  onChanged: () => void;
}

export default function SiteGallery({ siteId, gallery, onActivityClick, onChanged }: SiteGalleryProps) {
  const [preview, setPreview] = useState<{ photo: HubGalleryPhoto; url: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<HubGalleryPhoto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { userId } = useCurrentUser();
  const { isAdmin } = useUserProfile();
  const { hasPermission } = useProfilePermissions();

  const canManageSiteFiles =
    isAdmin ||
    hasPermission("action_projects_delete_site", "delete") ||
    hasPermission("action_projects_edit_site", "edit") ||
    hasPermission("module_projects_sites", "delete");

  const canDeletePhoto = (p: HubGalleryPhoto) => {
    if (p.kind === "activity") return isAdmin || (!!userId && p.uploadedById === userId);
    if (p.fileId) return canManageSiteFiles || (!!userId && p.uploadedById === userId);
    return canManageSiteFiles;
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      if (confirmDelete.kind === "activity" && confirmDelete.activityId) {
        await deleteActivityPhoto(confirmDelete.activityId, confirmDelete.storageKey);
      } else if (confirmDelete.fileId) {
        await deleteSiteFile(confirmDelete.fileId, confirmDelete.storageKey);
      } else {
        await deleteLegacySiteAttachment(siteId, confirmDelete.storageKey);
      }
      toast.success("Photo deleted");
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
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {gallery.length} {gallery.length === 1 ? "photo" : "photos"}
        </p>
        <SiteFileDropzone siteId={siteId} kind="photo" onUploaded={onChanged} accept="image/*" />
      </div>

      {gallery.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center border rounded-xl">No photos uploaded yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {gallery.map((p, i) => (
            <GalleryThumb
              key={`${p.storageKey}-${i}`}
              photo={p}
              onOpen={(photo, url) => setPreview({ photo, url })}
              onActivityClick={onActivityClick}
              canDelete={canDeletePhoto(p)}
              onDelete={setConfirmDelete}
            />
          ))}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-2xl p-2">
          {preview && (
            <div className="space-y-2">
              <img src={preview.url} alt={preview.photo.label || "Photo"} className="w-full max-h-[70vh] object-contain rounded" />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 pb-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><User className="h-3 w-3" />{preview.photo.uploadedBy}</span>
                {preview.photo.at && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{format(parseISO(preview.photo.at), "dd MMM yyyy, h:mm a")}</span>}
                {preview.photo.activityCode && (
                  <Badge variant="secondary" className="font-mono cursor-pointer" onClick={() => { preview.photo.activityId && onActivityClick?.(preview.photo.activityId); setPreview(null); }}>
                    {preview.photo.activityCode}
                  </Badge>
                )}
                <Button
                  size="sm" variant="outline" className="ml-auto h-7"
                  onClick={() => window.open(preview.url, "_blank")}
                >
                  <Download className="h-3.5 w-3.5 mr-1" /> Download
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete photo?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this photo? This action cannot be undone.
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
