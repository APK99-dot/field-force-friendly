import { useState, useMemo, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useModuleConfig } from "@/hooks/useModuleConfig";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Save, Camera, ImageIcon, X, ArrowLeft, Star, PackageCheck, Package, ClipboardCheck,
} from "lucide-react";
import { receiptDrivenStatus, GRN_STATUSES, GrnStatus } from "@/lib/procurement";
import { uploadGrnPhoto, removeGrnPhoto } from "@/utils/grnPhotos";
import { StarRating } from "./VendorRating";
import { cn } from "@/lib/utils";
import { useUiMode, isLightning } from "@/hooks/useUiMode";
import CameraCapture from "@/components/CameraCapture";

const MAX_PHOTOS = 20;
const FIELD_LABEL = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

export interface POItem {
  id: string;
  product_id: string | null;
  rate: number;
  qty: number;
  uom: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  poId: string;
  poNumber: string;
  vendorId?: string | null;
  sourceType?: string | null;
  transferFromSiteName?: string;
  items: POItem[];
  /** already-received qty keyed by procurement_item_id */
  alreadyReceived: Record<string, number>;
  productName: (id: string | null) => string;
  createdBy?: string;
  onSaved: () => void;
  /** Vendors assigned across this PO's line items — enables per-vendor GRN */
  poVendors?: { id: string; name: string }[];
  /** Map procurement_item_id -> vendor_ids assigned to that line */
  itemVendorMap?: Record<string, string[]>;
}

export default function GRNForm({
  open, onOpenChange, poId, poNumber, vendorId, sourceType, transferFromSiteName, items, alreadyReceived, productName, createdBy, onSaved,
  poVendors, itemVendorMap,
}: Props) {
  const isTransfer = sourceType === "internal_transfer";
  const queryClient = useQueryClient();
  const { profile } = useUserProfile();
  const grnCfg = useModuleConfig("goods_receipt");
  const cfgTakePhoto = grnCfg.bool("takePhoto");
  const cfgUploadGallery = grnCfg.bool("uploadGallery");
  const cfgVendorRating = grnCfg.bool("vendorRating");
  const maxPhotos = grnCfg.num("maxPhotos") || MAX_PHOTOS;
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [receivedBy, setReceivedBy] = useState("");
  const [remarks, setRemarks] = useState("");
  const [status, setStatus] = useState<GrnStatus>("Pending");
  const [statusManuallySet, setStatusManuallySet] = useState(false);
  const [recv, setRecv] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(
    vendorId || (poVendors && poVendors.length === 1 ? poVendors[0].id : null),
  );
  const visibleItems = useMemo(() => {
    if (!selectedVendorId || !itemVendorMap) return items;
    return items.filter((it) => (itemVendorMap[it.id] || []).includes(selectedVendorId));
  }, [items, selectedVendorId, itemVendorMap]);
  const [photos, setPhotos] = useState<{ path: string; preview: string }[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // vendor feedback (optional)
  const [fbDelivery, setFbDelivery] = useState(0);
  const [fbQuality, setFbQuality] = useState(0);
  const [fbQuantity, setFbQuantity] = useState(0);
  const [fbOverall, setFbOverall] = useState(0);
  const [fbComments, setFbComments] = useState("");
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  useEffect(() => {
    if (profile?.full_name) {
      setReceivedBy(profile.full_name);
    }
  }, [profile?.full_name]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = maxPhotos - photos.length;
    if (remaining <= 0) {
      toast.error(`Maximum ${maxPhotos} photos allowed`);
      return;
    }
    const list = Array.from(files).slice(0, remaining);
    setUploadingPhoto(true);
    try {
      for (const file of list) {
        const path = await uploadGrnPhoto(file);
        setPhotos((p) => [...p, { path, preview: URL.createObjectURL(file) }]);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to upload photo");
    } finally {
      setUploadingPhoto(false);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  };

  const handleCapturedBlob = async (blob: Blob) => {
    if (photos.length >= maxPhotos) {
      toast.error(`Maximum ${maxPhotos} photos allowed`);
      return;
    }
    setUploadingPhoto(true);
    try {
      const path = await uploadGrnPhoto(blob);
      setPhotos((p) => [...p, { path, preview: URL.createObjectURL(blob) }]);
    } catch (err: any) {
      toast.error(err.message || "Failed to upload photo");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removePhoto = async (idx: number) => {
    const photo = photos[idx];
    setPhotos((p) => p.filter((_, i) => i !== idx));
    if (photo) await removeGrnPhoto(photo.path);
  };

  const balance = (it: POItem) => Math.max(0, it.qty - (alreadyReceived[it.id] || 0));

  const totals = useMemo(() => {
    const ordered = visibleItems.reduce((s, it) => s + it.qty, 0);
    const priorReceived = visibleItems.reduce((s, it) => s + (alreadyReceived[it.id] || 0), 0);
    const thisReceipt = visibleItems.reduce((s, it) => s + (parseFloat(recv[it.id]) || 0), 0);
    return { ordered, priorReceived, thisReceipt, cumulative: priorReceived + thisReceipt };
  }, [visibleItems, alreadyReceived, recv]);

  const progressPct = totals.ordered > 0
    ? Math.min(100, Math.round((totals.cumulative / totals.ordered) * 100))
    : 0;

  useEffect(() => {
    if (statusManuallySet) return;
    const { thisReceipt, ordered, cumulative } = totals;
    if (thisReceipt === 0) {
      setStatus("Pending");
    } else if (cumulative >= ordered && ordered > 0) {
      setStatus("Fully Received");
    } else {
      setStatus("Partially Received");
    }
  }, [totals, statusManuallySet]);

  const handleStatusSelect = (s: GrnStatus) => {
    setStatusManuallySet(true);
    setStatus(s);
  };

  const handleSave = async () => {
    const rows = visibleItems
      .map((it) => ({ it, received: parseFloat(recv[it.id]) || 0 }))
      .filter((r) => r.received > 0);
    if (status !== "Rejected" && rows.length === 0) {
      toast.error("Enter received quantity for at least one item");
      return;
    }
    setSaving(true);
    try {
      const { data: grn, error } = await supabase
        .from("procurement_grns")
        .insert({
          po_id: poId,
          receipt_date: receiptDate,
          received_by: receivedBy.trim() || null,
          remarks: remarks.trim() || null,
          status,
          photos: photos.map((p) => p.path),
          created_by: createdBy,
          vendor_id: selectedVendorId,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (rows.length) {
        const itemRows = rows.map((r) => ({
          grn_id: grn.id,
          procurement_item_id: r.it.id,
          product_id: r.it.product_id,
          ordered_qty: r.it.qty,
          received_qty: r.received,
        }));
        const { error: ie } = await supabase.from("procurement_grn_items").insert(itemRows);
        if (ie) throw ie;
      }

      // Drive PO status from cumulative received
      if (status !== "Rejected") {
        const next = receiptDrivenStatus(totals.ordered, totals.cumulative, "");
        if (next) {
          await supabase.from("procurement_orders").update({ status: next }).eq("id", poId);
        }
      }

      // Optional vendor feedback — save together with the GRN
      const anyRating = fbDelivery || fbQuality || fbQuantity || fbOverall;
      if (anyRating && selectedVendorId) {
        if (!fbDelivery || !fbQuality || !fbQuantity || !fbOverall) {
          toast.warning("Skipped rating — please rate all four categories");
        } else {
          const { error: fe } = await supabase.from("procurement_vendor_feedback").insert({
            grn_id: grn.id,
            vendor_id: selectedVendorId,
            po_id: poId,
            delivery_timeliness: fbDelivery,
            material_quality: fbQuality,
            quantity_accuracy: fbQuantity,
            overall_experience: fbOverall,
            comments: fbComments.trim() || null,
            created_by: createdBy ?? null,
          });
          if (fe) toast.error("GRN saved, but feedback failed: " + fe.message);
          else queryClient.invalidateQueries({ queryKey: ["vendor-feedback"] });
        }
      }

      toast.success("Goods Receipt recorded");
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Failed to save GRN");
    } finally {
      setSaving(false);
    }
  };

  const selectedVendorName =
    poVendors?.find((v) => v.id === selectedVendorId)?.name || (isTransfer ? transferFromSiteName : null) || "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-none w-screen h-screen sm:rounded-none p-0 gap-0 flex flex-col", lightning && "lightning-ui")}>
        {/* ---- Header ---- */}
        <DialogHeader className={cn("px-3 sm:px-5 py-2.5 border-b shrink-0 space-y-0", lightning && "bg-white")}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md p-1.5 hover:bg-muted transition-colors shrink-0"
              aria-label="Back"
            >
              <ArrowLeft className="h-4.5 w-4.5" />
            </button>
            {lightning && (
              <div className="sf-object-icon shrink-0"><PackageCheck className="h-5 w-5" /></div>
            )}
            <div className="min-w-0 flex-1">
              {lightning && <div className="sf-eyebrow">Goods Receipt</div>}
              <DialogTitle className={cn("truncate", lightning ? "sf-title" : "text-base")}>
                Goods Receipt — {poNumber}
              </DialogTitle>
              {lightning && (
                <div className="sf-subtitle truncate">
                  {isTransfer ? "Internal transfer receipt" : `Receipt from ${selectedVendorName}`}
                </div>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* ---- Scrollable body ---- */}
        <div className={cn("overflow-y-auto flex-1 w-full", lightning && "bg-[var(--sf-surface-shell,#f3f2f2)]")}>
          <div className="w-full px-2 sm:px-3 py-3 sm:py-5 space-y-4">

            {/* Highlights panel */}
            <div className="sf-highlights rounded-md border bg-card px-4 py-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
                <div>
                  <div className="sf-field-label text-[11px] uppercase tracking-wide text-muted-foreground">PO Number</div>
                  <div className="sf-field-value text-sm font-semibold truncate">{poNumber}</div>
                </div>
                <div>
                  <div className="sf-field-label text-[11px] uppercase tracking-wide text-muted-foreground">
                    {isTransfer ? "Transferred From" : "Vendor"}
                  </div>
                  <div className="sf-field-value text-sm font-semibold truncate">{selectedVendorName}</div>
                </div>
                <div>
                  <div className="sf-field-label text-[11px] uppercase tracking-wide text-muted-foreground">Line Items</div>
                  <div className="sf-field-value text-sm font-semibold">{visibleItems.length}</div>
                </div>
                <div>
                  <div className="sf-field-label text-[11px] uppercase tracking-wide text-muted-foreground">Status</div>
                  <div className="sf-field-value text-sm font-semibold">{status}</div>
                </div>
              </div>
            </div>

            {/* Receipt Information */}
            <section className="sf-card rounded-md border bg-card">
              <div className="px-4 sm:px-5 py-3 border-b flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Receipt Information</h2>
              </div>
              <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                {isTransfer && (
                  <div className="md:col-span-2 lg:col-span-1">
                    <Label className={FIELD_LABEL}>Transferred From Site</Label>
                    <Input value={transferFromSiteName || "—"} readOnly disabled className="h-9 mt-1 bg-muted/50" />
                  </div>
                )}
                {!isTransfer && poVendors && poVendors.length > 0 && (
                  <div className="md:col-span-2 lg:col-span-1">
                    <Label className={FIELD_LABEL}>Vendor (receipt from)</Label>
                    <select
                      className="h-9 mt-1 w-full rounded-md border bg-background px-3 text-sm"
                      value={selectedVendorId || ""}
                      onChange={(e) => setSelectedVendorId(e.target.value || null)}
                    >
                      <option value="">— Select vendor —</option>
                      {poVendors.map((v) => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                    {selectedVendorId && itemVendorMap && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Showing only line items assigned to this vendor ({visibleItems.length} of {items.length}).
                      </p>
                    )}
                  </div>
                )}
                <div>
                  <Label className={FIELD_LABEL}>Date of Receipt</Label>
                  <Input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} className="h-9 mt-1" />
                </div>
                <div>
                  <Label className={FIELD_LABEL}>Received By</Label>
                  <Input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder="Name" className="h-9 mt-1" />
                </div>
              </div>
            </section>

            {/* Items */}
            <section className="sf-card rounded-md border bg-card">
              <div className="px-4 sm:px-5 py-3 border-b flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">Items — Ordered vs Received</h2>
                </div>
                <span className="text-xs text-muted-foreground">{visibleItems.length} item{visibleItems.length === 1 ? "" : "s"}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[680px]">
                  <thead>
                    <tr className="bg-muted/60 text-xs text-muted-foreground">
                      <th className="text-left font-medium px-4 py-2.5">Material</th>
                      <th className="text-left font-medium px-3 py-2.5 w-24">UOM</th>
                      <th className="text-right font-medium px-3 py-2.5 w-28">Ordered</th>
                      <th className="text-right font-medium px-3 py-2.5 w-32">Prev. Received</th>
                      <th className="text-right font-medium px-3 py-2.5 w-28">Balance</th>
                      <th className="text-center font-medium px-4 py-2.5 w-40 bg-primary/10 text-primary">Receiving Now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          No line items for the selected vendor.
                        </td>
                      </tr>
                    )}
                    {visibleItems.map((it) => {
                      const bal = balance(it);
                      const prev = alreadyReceived[it.id] || 0;
                      return (
                        <tr key={it.id} className="border-t">
                          <td className="px-4 py-2.5 font-medium">{productName(it.product_id)}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{it.uom || "—"}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{it.qty}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{prev}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-medium">{bal}</td>
                          <td className="px-4 py-2 bg-primary/5">
                            <Input
                              type="number" inputMode="decimal"
                              className="h-9 w-full max-w-[120px] mx-auto text-right bg-background border-primary/40 focus-visible:ring-primary"
                              value={recv[it.id] || ""}
                              onChange={(e) => setRecv((p) => ({ ...p, [it.id]: e.target.value }))}
                              placeholder="0"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t px-4 sm:px-5 py-3 space-y-1.5 bg-muted/20">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Cumulative received</span>
                  <span className="font-semibold tabular-nums">{totals.cumulative} / {totals.ordered}</span>
                </div>
                <Progress value={progressPct} className="h-2" />
              </div>
            </section>

            {/* Status + Remarks */}
            <section className="sf-card rounded-md border bg-card">
              <div className="px-4 sm:px-5 py-3 border-b flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Status &amp; Remarks</h2>
              </div>
              <div className="p-4 sm:p-5 space-y-4">
                <div>
                  <Label className={FIELD_LABEL}>GRN Status</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {GRN_STATUSES.map((s) => {
                      const active = status === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleStatusSelect(s)}
                          className={cn(
                            "rounded-full px-4 py-1.5 text-sm font-medium border transition-colors",
                            active
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background text-foreground border-input hover:bg-muted"
                          )}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label className={FIELD_LABEL}>Remarks</Label>
                  <Textarea
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Notes about this receipt..."
                    rows={3}
                    className="mt-1"
                  />
                </div>
              </div>
            </section>

            {/* Photos */}
            {(cfgTakePhoto || cfgUploadGallery) && (
              <section className="sf-card rounded-md border bg-card">
                <div className="px-4 sm:px-5 py-3 border-b flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold">Goods Photos</h2>
                  </div>
                  <span className="text-xs text-muted-foreground">{photos.length} / {maxPhotos}</span>
                </div>
                <div className="p-4 sm:p-5">
                  <p className="text-[11px] text-muted-foreground mb-3">Proof of delivery — up to {maxPhotos} photos.</p>
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                  <div className="flex flex-wrap gap-2">
                    {cfgTakePhoto && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={uploadingPhoto || photos.length >= maxPhotos}
                        onClick={() => setCameraOpen(true)}
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        {uploadingPhoto ? "Uploading..." : "Take Photo"}
                      </Button>
                    )}
                    {cfgUploadGallery && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={uploadingPhoto || photos.length >= maxPhotos}
                        onClick={() => galleryInputRef.current?.click()}
                      >
                        <ImageIcon className="h-4 w-4 mr-2" />
                        Upload from Gallery
                      </Button>
                    )}
                  </div>
                  {photos.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 gap-2 mt-4">
                      {photos.map((p, idx) => (
                        <div key={p.path} className="relative aspect-square rounded-md overflow-hidden border">
                          <img src={p.preview} alt={`Goods photo ${idx + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removePhoto(idx)}
                            className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5"
                            aria-label="Remove photo"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Vendor Feedback (optional) */}
            {selectedVendorId && cfgVendorRating && (
              <section className="sf-card rounded-md border bg-card">
                <div className="px-4 sm:px-5 py-3 border-b flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-400" />
                  <h2 className="text-sm font-semibold">Rate this Delivery</h2>
                  <span className="text-[11px] text-muted-foreground">(optional)</span>
                </div>
                <div className="p-4 sm:p-5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                    {[
                      { label: "Delivery Timeliness", value: fbDelivery, set: setFbDelivery },
                      { label: "Material Quality", value: fbQuality, set: setFbQuality },
                      { label: "Quantity Accuracy", value: fbQuantity, set: setFbQuantity },
                      { label: "Overall Experience", value: fbOverall, set: setFbOverall },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-2">
                        <span className="text-sm">{row.label}</span>
                        <StarRating value={row.value} onChange={row.set} />
                      </div>
                    ))}
                  </div>
                  <Textarea
                    value={fbComments}
                    onChange={(e) => setFbComments(e.target.value)}
                    placeholder="Additional comments (optional)..."
                    rows={2}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    You can skip this now and rate later from the receipt's detail screen.
                  </p>
                </div>
              </section>
            )}
          </div>
        </div>

        {/* ---- Sticky footer ---- */}
        <div
          className={cn("shrink-0 border-t p-3", lightning ? "bg-white" : "bg-background")}
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="flex justify-end gap-2 px-1 sm:px-2">
            <Button variant="outline" className="flex-1 sm:flex-none sm:min-w-[120px]" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="flex-1 sm:flex-none sm:min-w-[160px]" onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />{saving ? "Saving..." : "Save GRN"}
            </Button>
          </div>
        </div>
      </DialogContent>
      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handleCapturedBlob}
        title="Capture Goods Photo"
      />
    </Dialog>
  );
}
