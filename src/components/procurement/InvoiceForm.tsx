import { useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save, FileText, Paperclip, X, Plus, Trash2 } from "lucide-react";
import { fmtAmt } from "@/lib/procurement";
import { uploadInvoiceFile, removeInvoiceFile } from "@/utils/invoiceAttachments";
import type { POItem } from "./GRNForm";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  poId: string;
  poNumber: string;
  vendorNameStr?: string;
  items: POItem[];
  productName: (id: string | null) => string;
  createdBy?: string;
  onSaved: () => void;
  /** Vendors assigned across this PO's line items — enables per-vendor invoice */
  poVendors?: { id: string; name: string }[];
  /** Map procurement_item_id -> vendor_ids assigned to that line */
  itemVendorMap?: Record<string, string[]>;
  /** Existing invoices already on this PO — used for duplicate detection */
  existingInvoices?: { invoice_number: string | null; invoice_amount: number; vendor_id?: string | null }[];
}


interface AttachedFile {
  path: string;
  name: string;
  size: number;
}

interface PaymentLine {
  id: string;
  reference_number: string;
  bank_name: string;
  amount: string;
  payment_date: string;
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const newPayment = (): PaymentLine => ({
  id: Math.random().toString(36).slice(2),
  reference_number: "",
  bank_name: "",
  amount: "",
  payment_date: new Date().toISOString().slice(0, 10),
});

export default function InvoiceForm({
  open, onOpenChange, poId, poNumber, vendorNameStr, items, productName, createdBy, onSaved,
  poVendors, itemVendorMap, existingInvoices,
}: Props) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [payments, setPayments] = useState<PaymentLine[]>([newPayment()]);
  const [saving, setSaving] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(
    poVendors && poVendors.length === 1 ? poVendors[0].id : null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const visibleItems = useMemo(() => {
    if (!selectedVendorId || !itemVendorMap) return items;
    return items.filter((it) => (itemVendorMap[it.id] || []).includes(selectedVendorId));
  }, [items, selectedVendorId, itemVendorMap]);

  const amount = useMemo(
    () => visibleItems.reduce((s, it) => s + it.rate * it.qty, 0),
    [visibleItems]
  );

  const totalPaid = useMemo(
    () => payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0),
    [payments]
  );
  const balanceDue = amount - totalPaid;

  const handleFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        const path = await uploadInvoiceFile(file);
        setFiles((p) => [...p, { path, name: file.name, size: file.size }]);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeFile = async (idx: number) => {
    const f = files[idx];
    setFiles((p) => p.filter((_, i) => i !== idx));
    if (f) await removeInvoiceFile(f.path);
  };

  const updatePayment = (id: string, patch: Partial<PaymentLine>) =>
    setPayments((p) => p.map((pl) => (pl.id === id ? { ...pl, ...patch } : pl)));
  const removePayment = (id: string) =>
    setPayments((p) => p.filter((pl) => pl.id !== id));

  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);

  const handleSave = async () => {
    if (!invoiceNumber.trim()) { toast.error("Invoice number is required"); return; }

    // Duplicate detection: same invoice number (case-insensitive) OR near-identical amount
    if (!duplicateAcknowledged && existingInvoices && existingInvoices.length) {
      const num = invoiceNumber.trim().toLowerCase();
      const dup = existingInvoices.find((e) => {
        const sameNumber = (e.invoice_number || "").trim().toLowerCase() === num;
        const sameAmt = Math.abs(Number(e.invoice_amount || 0) - amount) < 0.01 && amount > 0;
        return sameNumber || sameAmt;
      });
      if (dup) {
        const msg = `An invoice with ${(dup.invoice_number || "").trim().toLowerCase() === num ? `number "${dup.invoice_number}"` : `amount ${dup.invoice_amount}`} already exists on this PO. Add anyway?`;
        if (!window.confirm(msg)) return;
        setDuplicateAcknowledged(true);
      }
    }

    setSaving(true);
    try {
      const { data: inv, error } = await supabase
        .from("procurement_invoices")
        .insert({
          po_id: poId,
          invoice_number: invoiceNumber.trim(),
          invoice_date: invoiceDate,
          invoice_amount: amount,
          created_by: createdBy,
          vendor_id: selectedVendorId,
        })
        .select("id")
        .single();
      if (error) throw error;

      const itemRows = visibleItems.map((it) => ({
        invoice_id: inv.id,
        procurement_item_id: it.id,
        product_id: it.product_id,
        invoiced_rate: it.rate,
        invoiced_qty: it.qty,
      }));
      const { error: ie } = await supabase.from("procurement_invoice_items").insert(itemRows);
      if (ie) throw ie;

      if (files.length) {
        const { error: ae } = await supabase.from("procurement_invoice_attachments").insert(
          files.map((f) => ({
            invoice_id: inv.id,
            file_name: f.name,
            file_size: f.size,
            file_path: f.path,
            created_by: createdBy,
          }))
        );
        if (ae) throw ae;
      }

      const validPayments = payments.filter(
        (p) => (parseFloat(p.amount) || 0) > 0 || p.reference_number.trim() || p.bank_name.trim()
      );
      if (validPayments.length) {
        const { error: pe } = await supabase.from("procurement_invoice_payments").insert(
          validPayments.map((p) => ({
            invoice_id: inv.id,
            reference_number: p.reference_number.trim() || null,
            bank_name: p.bank_name.trim() || null,
            amount: parseFloat(p.amount) || 0,
            payment_date: p.payment_date || null,
            created_by: createdBy,
          }))
        );
        if (pe) throw pe;
      }

      toast.success("Invoice recorded");
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Failed to save invoice");
    } finally {
      setSaving(false);
    }
  };

  const activeVendorName =
    poVendors?.find((v) => v.id === selectedVendorId)?.name || vendorNameStr || "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-none w-screen h-screen sm:rounded-none p-0 gap-0 flex flex-col", lightning && "lightning-ui")}>
        {/* ---- Header ---- */}
        <DialogHeader className={cn("px-3 sm:px-5 py-2.5 border-b shrink-0 space-y-0", lightning && "bg-white")}>
          <div className="flex items-center gap-3">
            {lightning ? (
              <div className="sf-object-icon shrink-0"><FileText className="h-5 w-5" /></div>
            ) : (
              <FileText className="h-4 w-4 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              {lightning && <div className="sf-eyebrow">Procurement</div>}
              <DialogTitle className={cn("truncate", lightning ? "sf-title" : "text-base")}>
                Record Invoice — {poNumber}
              </DialogTitle>
              {lightning && <div className="sf-subtitle truncate">Vendor invoice &amp; payment capture</div>}
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
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">PO Number</div>
                  <div className="text-sm font-semibold truncate">{poNumber}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Vendor</div>
                  <div className="text-sm font-semibold truncate">{activeVendorName}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Invoice Total</div>
                  <div className="text-sm font-semibold tabular-nums">{fmtAmt(amount)}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Balance Due</div>
                  <div className={cn("text-sm font-semibold tabular-nums", balanceDue > 0.005 ? "text-destructive" : "text-emerald-600")}>
                    {fmtAmt(balanceDue)}
                  </div>
                </div>
              </div>
            </div>

            {/* Invoice Information */}
            <section className="sf-card rounded-md border bg-card">
              <div className="px-4 sm:px-5 py-3 border-b flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Invoice Information</h2>
              </div>
              <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                {poVendors && poVendors.length > 0 && (
                  <div className="md:col-span-2 lg:col-span-1">
                    <Label className={FIELD_LABEL}>Vendor (invoice from)</Label>
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
                  <Label className={FIELD_LABEL}>
                    Invoice Number <span className="text-destructive">*</span>
                  </Label>
                  <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-0001" className="h-9 mt-1" />
                </div>
                <div>
                  <Label className={FIELD_LABEL}>Invoice Date</Label>
                  <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="h-9 mt-1" />
                </div>
              </div>
            </section>

            {/* Line items */}
            <section className="sf-card rounded-md border bg-card">
              <div className="px-4 sm:px-5 py-3 border-b flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">Line Items (from PO)</h2>
                </div>
                <span className="text-xs text-muted-foreground">{visibleItems.length} item{visibleItems.length === 1 ? "" : "s"}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="bg-muted/60 text-xs text-muted-foreground">
                      <th className="text-left font-medium px-4 py-2.5">Material</th>
                      <th className="text-right font-medium px-3 py-2.5 w-36">PO Rate</th>
                      <th className="text-right font-medium px-3 py-2.5 w-32">Qty</th>
                      <th className="text-right font-medium px-4 py-2.5 w-40">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          No line items for the selected vendor.
                        </td>
                      </tr>
                    )}
                    {visibleItems.map((it) => (
                      <tr key={it.id} className="border-t">
                        <td className="px-4 py-2.5 font-medium">{productName(it.product_id)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{fmtAmt(it.rate)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{it.qty}{it.uom ? ` ${it.uom}` : ""}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium">{fmtAmt(it.rate * it.qty)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/30">
                      <td colSpan={3} className="px-4 py-3 text-right text-sm font-semibold">Invoice Total</td>
                      <td className="px-4 py-3 text-right text-base font-bold text-primary tabular-nums">{fmtAmt(amount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            {/* Attachments */}
            <section className="sf-card rounded-md border bg-card">
              <div className="px-4 sm:px-5 py-3 border-b flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">Invoice Documents</h2>
                </div>
                <span className="text-xs text-muted-foreground">{files.length} file{files.length === 1 ? "" : "s"}</span>
              </div>
              <div className="p-4 sm:p-5">
                <p className="text-[11px] text-muted-foreground mb-3">Vendor invoice scans — PDF, JPG, PNG. Attach as many as needed.</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/png,image/jpeg"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-4 w-4 mr-2" />
                  {uploading ? "Uploading..." : "Attach Files"}
                </Button>
                {files.length > 0 && (
                  <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-2">
                    {files.map((f, idx) => (
                      <div key={f.path} className="flex items-center gap-3 rounded-md border p-2.5">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{f.name}</div>
                          <div className="text-[11px] text-muted-foreground">{formatBytes(f.size)}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(idx)}
                          className="rounded-full p-1 hover:bg-muted text-muted-foreground"
                          aria-label="Remove file"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Payments */}
            <section className="sf-card rounded-md border bg-card">
              <div className="px-4 sm:px-5 py-3 border-b flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">Payment Details</h2>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setPayments((p) => [...p, newPayment()])}>
                  <Plus className="h-4 w-4 mr-1" />Add Payment
                </Button>
              </div>
              <div className="p-4 sm:p-5 space-y-3">
                {payments.map((p, i) => (
                  <div key={p.id} className="rounded-md border p-3 space-y-2.5 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment {i + 1}</span>
                      <button
                        type="button"
                        onClick={() => removePayment(p.id)}
                        className="rounded-full p-1 hover:bg-muted text-muted-foreground"
                        aria-label="Remove payment"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <Label className={FIELD_LABEL}>Payment Reference No.</Label>
                        <Input value={p.reference_number} onChange={(e) => updatePayment(p.id, { reference_number: e.target.value })} placeholder="UTR / Cheque #" className="h-9 mt-1 bg-background" />
                      </div>
                      <div>
                        <Label className={FIELD_LABEL}>Vendor Bank Name</Label>
                        <Input value={p.bank_name} onChange={(e) => updatePayment(p.id, { bank_name: e.target.value })} placeholder="Bank" className="h-9 mt-1 bg-background" />
                      </div>
                      <div>
                        <Label className={FIELD_LABEL}>Amount (₹)</Label>
                        <Input type="number" inputMode="decimal" value={p.amount} onChange={(e) => updatePayment(p.id, { amount: e.target.value })} placeholder="0" className="h-9 mt-1 bg-background text-right" />
                      </div>
                      <div>
                        <Label className={FIELD_LABEL}>Date of Payment</Label>
                        <Input type="date" value={p.payment_date} onChange={(e) => updatePayment(p.id, { payment_date: e.target.value })} className="h-9 mt-1 bg-background" />
                      </div>
                    </div>
                  </div>
                ))}

                <div className="rounded-md border bg-muted/30 p-3 sm:ml-auto sm:max-w-sm space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Invoice Total</span>
                    <span className="font-semibold tabular-nums">{fmtAmt(amount)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total Paid</span>
                    <span className="font-semibold tabular-nums">{fmtAmt(totalPaid)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm border-t pt-1.5">
                    <span className="text-muted-foreground">Balance Due</span>
                    <span className={cn("font-bold tabular-nums", balanceDue > 0.005 ? "text-destructive" : "text-emerald-600")}>
                      {fmtAmt(balanceDue)}
                    </span>
                  </div>
                </div>
              </div>
            </section>
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
              <Save className="h-4 w-4 mr-2" />{saving ? "Saving..." : "Save Invoice"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
