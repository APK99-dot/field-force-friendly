import { useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save, Truck, Camera, ImageIcon, X } from "lucide-react";
import { GRN_STATUSES, receiptDrivenStatus } from "@/lib/procurement";
import { uploadGrnPhoto, removeGrnPhoto } from "@/utils/grnPhotos";

const MAX_PHOTOS = 5;

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
  items: POItem[];
  /** already-received qty keyed by procurement_item_id */
  alreadyReceived: Record<string, number>;
  productName: (id: string | null) => string;
  createdBy?: string;
  onSaved: () => void;
}

export default function GRNForm({
  open, onOpenChange, poId, poNumber, items, alreadyReceived, productName, createdBy, onSaved,
}: Props) {
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [receivedBy, setReceivedBy] = useState("");
  const [remarks, setRemarks] = useState("");
  const [status, setStatus] = useState<string>("Fully Received");
  const [recv, setRecv] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<{ path: string; preview: string }[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      toast.error(`Maximum ${MAX_PHOTOS} photos allowed`);
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
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removePhoto = async (idx: number) => {
    const photo = photos[idx];
    setPhotos((p) => p.filter((_, i) => i !== idx));
    if (photo) await removeGrnPhoto(photo.path);
  };

  const balance = (it: POItem) => Math.max(0, it.qty - (alreadyReceived[it.id] || 0));

  const totals = useMemo(() => {
    const ordered = items.reduce((s, it) => s + it.qty, 0);
    const priorReceived = items.reduce((s, it) => s + (alreadyReceived[it.id] || 0), 0);
    const thisReceipt = items.reduce((s, it) => s + (parseFloat(recv[it.id]) || 0), 0);
    return { ordered, priorReceived, thisReceipt, cumulative: priorReceived + thisReceipt };
  }, [items, alreadyReceived, recv]);

  const handleSave = async () => {
    const rows = items
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

      toast.success("Goods Receipt recorded");
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Failed to save GRN");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-screen h-screen sm:rounded-none p-0 gap-0 flex flex-col">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-4 w-4" />Goods Receipt — {poNumber}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 p-4 overflow-y-auto flex-1 max-w-3xl w-full mx-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Date of Receipt</Label>
              <Input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Received By</Label>
              <Input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder="Name" className="h-9" />
            </div>
          </div>

          <div>
            <Label className="text-sm font-semibold">Items — Ordered vs Received</Label>
            <div className="space-y-2 mt-2">
              {items.map((it) => {
                const bal = balance(it);
                return (
                  <div key={it.id} className="rounded-lg border p-2.5 bg-muted/30">
                    <div className="text-sm font-medium mb-1.5">{productName(it.product_id)}</div>
                    <div className="grid grid-cols-3 gap-2 items-end">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Ordered ({it.uom || "—"})</Label>
                        <div className="h-8 flex items-center text-sm">{it.qty}</div>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Balance</Label>
                        <div className="h-8 flex items-center text-sm">{bal}</div>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Receiving Now</Label>
                        <Input
                          type="number" inputMode="decimal" className="h-8"
                          value={recv[it.id] || ""}
                          onChange={(e) => setRecv((p) => ({ ...p, [it.id]: e.target.value }))}
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">GRN Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{GRN_STATUSES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="flex items-end text-xs text-muted-foreground">
              Cumulative received: {totals.cumulative} / {totals.ordered}
            </div>
          </div>

          <div>
            <Label className="text-xs">Remarks</Label>
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Notes about this receipt..." rows={2} />
          </div>

          <div>
            <Label className="text-sm font-semibold">Goods Photos</Label>
            <p className="text-[11px] text-muted-foreground mb-2">Proof of delivery — up to {MAX_PHOTOS} photos.</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={uploadingPhoto || photos.length >= MAX_PHOTOS}
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="h-4 w-4 mr-2" />
              {uploadingPhoto ? "Uploading..." : "📷 Capture / Upload Photos"}
            </Button>
            {photos.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
                {photos.map((p, idx) => (
                  <div key={p.path} className="relative aspect-square rounded-lg overflow-hidden border">
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

          <div className="flex gap-2 pt-2 pb-6">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />{saving ? "Saving..." : "Save GRN"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
