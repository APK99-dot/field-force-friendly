import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save, Truck } from "lucide-react";
import { GRN_STATUSES, receiptDrivenStatus } from "@/lib/procurement";

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
