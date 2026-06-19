import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save, FileText } from "lucide-react";
import { fmtAmt } from "@/lib/procurement";
import type { POItem } from "./GRNForm";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  poId: string;
  poNumber: string;
  items: POItem[];
  productName: (id: string | null) => string;
  createdBy?: string;
  onSaved: () => void;
}

export default function InvoiceForm({
  open, onOpenChange, poId, poNumber, items, productName, createdBy, onSaved,
}: Props) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [rates, setRates] = useState<Record<string, string>>({});
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const amount = useMemo(
    () =>
      items.reduce(
        (s, it) => s + (parseFloat(rates[it.id]) || it.rate) * (parseFloat(qtys[it.id]) || it.qty),
        0
      ),
    [items, rates, qtys]
  );

  const handleSave = async () => {
    if (!invoiceNumber.trim()) { toast.error("Invoice number is required"); return; }
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
        })
        .select("id")
        .single();
      if (error) throw error;

      const itemRows = items.map((it) => ({
        invoice_id: inv.id,
        procurement_item_id: it.id,
        product_id: it.product_id,
        invoiced_rate: parseFloat(rates[it.id]) || it.rate,
        invoiced_qty: parseFloat(qtys[it.id]) || it.qty,
      }));
      const { error: ie } = await supabase.from("procurement_invoice_items").insert(itemRows);
      if (ie) throw ie;

      toast.success("Invoice recorded");
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Failed to save invoice");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-screen h-screen sm:rounded-none p-0 gap-0 flex flex-col">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />Record Invoice — {poNumber}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 p-4 overflow-y-auto flex-1 max-w-3xl w-full mx-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Invoice Number</Label>
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-0001" className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Invoice Date</Label>
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="h-9" />
            </div>
          </div>

          <div>
            <Label className="text-sm font-semibold">Line Items (PO rate pre-filled)</Label>
            <div className="space-y-2 mt-2">
              {items.map((it) => {
                const r = parseFloat(rates[it.id]) || it.rate;
                const q = parseFloat(qtys[it.id]) || it.qty;
                const mismatch = r !== it.rate;
                return (
                  <div key={it.id} className="rounded-lg border p-2.5 bg-muted/30">
                    <div className="text-sm font-medium mb-1.5">{productName(it.product_id)}</div>
                    <div className="grid grid-cols-3 gap-2 items-end">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">PO Rate {fmtAmt(it.rate)}</Label>
                        <Input
                          type="number" inputMode="decimal" className={`h-8 ${mismatch ? "border-amber-500" : ""}`}
                          value={rates[it.id] ?? String(it.rate)}
                          onChange={(e) => setRates((p) => ({ ...p, [it.id]: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Qty</Label>
                        <Input
                          type="number" inputMode="decimal" className="h-8"
                          value={qtys[it.id] ?? String(it.qty)}
                          onChange={(e) => setQtys((p) => ({ ...p, [it.id]: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Amount</Label>
                        <div className="h-8 flex items-center text-sm font-medium">{fmtAmt(r * q)}</div>
                      </div>
                    </div>
                    {mismatch && <p className="text-[10px] text-amber-600 mt-1">Rate differs from PO rate</p>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-sm font-semibold">Invoice Total</span>
            <span className="text-base font-bold text-primary">{fmtAmt(amount)}</span>
          </div>

          <div className="flex gap-2 pt-2 pb-6">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />{saving ? "Saving..." : "Save Invoice"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
