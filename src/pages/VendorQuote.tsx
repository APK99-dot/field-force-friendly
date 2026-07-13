import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, CheckCircle2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface LineItem {
  procurement_item_id: string;
  product_name: string;
  product_description: string;
  quality_instruction: string;
  qty: number;
  uom: string;
  expected_delivery_date: string | null;
  rate: number | null;
  discount_pct: number;
  rate_after_discount: number | null;
  delivery_commitment_date: string | null;
  is_selected: boolean;
}

interface QuoteData {
  status: string;
  submitted_at: string | null;
  vendor_payment_term: string;
  notes: string;
  requisition: {
    title: string;
    po_number: string | null;
    order_date: string | null;
    expected_payment_terms: string;
    bill_to: string;
    ship_to: string;
    site_name: string;
    site_address: string;
  };
  vendor: { name: string; contact_person: string | null; address: string | null; gst_number: string | null } | null;
  company: { company_name: string | null; logo_url: string | null; address: string | null } | null;
  items: LineItem[];
}

const fmtDate = (d?: string | null) => {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-GB");
};
const fmtAmt = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function VendorQuote() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<QuoteData | null>(null);
  const [rows, setRows] = useState<LineItem[]>([]);
  const [paymentTerm, setPaymentTerm] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${FN_BASE}/get-vendor-quote?token=${encodeURIComponent(token || "")}`, {
          headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
        });
        const body = await res.json();
        if (!active) return;
        if (!res.ok) {
          setError(body.error || "Unable to load this quote.");
        } else {
          setData(body);
          setRows(body.items || []);
          setPaymentTerm(body.vendor_payment_term || "");
          setNotes(body.notes || "");
          setSubmitted(body.status === "submitted");
        }
      } catch {
        if (active) setError("Unable to load this quote. Please check your link.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [token]);

  const updateRow = (id: string, patch: Partial<LineItem>) =>
    setRows((prev) => prev.map((r) => (r.procurement_item_id === id ? { ...r, ...patch } : r)));

  const rowAfter = (r: LineItem) => {
    const rate = Number(r.rate) || 0;
    const disc = Number(r.discount_pct) || 0;
    return rate * (1 - disc / 100);
  };

  const total = useMemo(
    () => rows.filter((r) => r.is_selected).reduce((s, r) => s + rowAfter(r) * (r.qty || 0), 0),
    [rows]
  );

  const send = async (doSubmit: boolean) => {
    if (doSubmit) {
      const selected = rows.filter((r) => r.is_selected);
      if (selected.length === 0) {
        toast.error("Select at least one item you can supply before submitting.");
        return;
      }
      if (selected.some((r) => !r.rate || Number(r.rate) <= 0)) {
        toast.error("Enter a rate for every selected item.");
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        token,
        vendor_payment_term: paymentTerm,
        notes,
        submit: doSubmit,
        items: rows.map((r) => ({
          procurement_item_id: r.procurement_item_id,
          rate: Number(r.rate) || 0,
          discount_pct: Number(r.discount_pct) || 0,
          delivery_commitment_date: r.delivery_commitment_date || null,
          is_selected: !!r.is_selected,
        })),
      };
      const res = await fetch(`${FN_BASE}/submit-vendor-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error || "Failed to save.");
        return;
      }
      if (doSubmit) {
        setSubmitted(true);
        toast.success("Quote submitted. Thank you!");
      } else {
        toast.success("Draft saved.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-bold mb-2">Quote unavailable</h1>
          <p className="text-muted-foreground">{error || "This link is not valid."}</p>
        </div>
      </div>
    );
  }

  const { requisition: req, vendor, company } = data;
  const readOnly = submitted;

  return (
    <div className="min-h-screen bg-muted/20 py-6 px-3 sm:px-6">
      <div className="mx-auto max-w-6xl bg-background rounded-xl shadow-md border">
        {/* Header */}
        <div className="flex items-center gap-4 p-5 border-b">
          <div className="w-16 h-16 rounded-lg border flex items-center justify-center overflow-hidden bg-white shrink-0">
            {company?.logo_url ? (
              <img src={company.logo_url} alt="Company logo" className="w-full h-full object-contain p-1" />
            ) : (
              <Building2 className="h-8 w-8 text-muted-foreground/50" />
            )}
          </div>
          <div>
            <div className="text-lg font-bold">{company?.company_name || "Company"}</div>
            {company?.address && <div className="text-xs text-muted-foreground">{company.address}</div>}
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="text-center">
            <h1 className="text-xl font-bold">Indent Order</h1>
            {req.title && <p className="text-sm text-muted-foreground mt-0.5">{req.title}</p>}
            {req.order_date && (
              <p className="text-xs text-muted-foreground mt-1">Date: {fmtDate(req.order_date)}</p>
            )}
          </div>

          {/* From / To */}
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="font-semibold">From:</div>
              <div>{company?.company_name || "-"}</div>
              {company?.address && <div className="text-muted-foreground">{company.address}</div>}
            </div>
            <div>
              <div className="font-semibold">To:</div>
              <div>{vendor?.name || "-"}</div>
              {vendor?.contact_person && <div className="text-muted-foreground">Attn: {vendor.contact_person}</div>}
              {vendor?.address && <div className="text-muted-foreground">{vendor.address}</div>}
            </div>
          </div>

          {req.site_name && (
            <p className="text-sm">
              Kindly arrange to supply the following materials to site{" "}
              <span className="font-semibold">"{req.site_name}"</span>.
            </p>
          )}

          {submitted && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-4 py-2.5 text-sm">
              <CheckCircle2 className="h-4 w-4" />
              Your quote has been submitted{data.submitted_at ? ` on ${fmtDate(data.submitted_at)}` : ""}. Thank you.
            </div>
          )}

          {/* Line items */}
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-muted/60 text-xs">
                <tr className="text-left">
                  <th className="p-2 font-semibold">Product</th>
                  <th className="p-2 font-semibold">Description</th>
                  <th className="p-2 font-semibold text-right">Qty</th>
                  <th className="p-2 font-semibold">UOM</th>
                  <th className="p-2 font-semibold">Quality Instructions</th>
                  <th className="p-2 font-semibold">Delivery Commitment</th>
                  <th className="p-2 font-semibold text-right">Rate/Unit</th>
                  <th className="p-2 font-semibold text-right">Discount %</th>
                  <th className="p-2 font-semibold text-right">Rate After Disc.</th>
                  <th className="p-2 font-semibold text-center">Supply?</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.procurement_item_id} className="border-t align-top">
                    <td className="p-2 font-medium">{r.product_name}</td>
                    <td className="p-2 text-muted-foreground">{r.product_description || "-"}</td>
                    <td className="p-2 text-right">{r.qty}</td>
                    <td className="p-2">{r.uom || "-"}</td>
                    <td className="p-2 text-muted-foreground text-xs max-w-[140px]">{r.quality_instruction || "-"}</td>
                    <td className="p-2">
                      <Input
                        type="date"
                        className="h-8 w-36"
                        disabled={readOnly}
                        value={r.delivery_commitment_date || ""}
                        onChange={(e) => updateRow(r.procurement_item_id, { delivery_commitment_date: e.target.value })}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min={0}
                        className="h-8 w-24 text-right"
                        disabled={readOnly}
                        value={r.rate ?? ""}
                        onChange={(e) => updateRow(r.procurement_item_id, { rate: e.target.value === "" ? null : Number(e.target.value) })}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        className="h-8 w-20 text-right"
                        disabled={readOnly}
                        value={r.discount_pct ?? 0}
                        onChange={(e) => updateRow(r.procurement_item_id, { discount_pct: e.target.value === "" ? 0 : Number(e.target.value) })}
                      />
                    </td>
                    <td className="p-2 text-right font-medium">{fmtAmt(rowAfter(r))}</td>
                    <td className="p-2 text-center">
                      <Checkbox
                        checked={r.is_selected}
                        disabled={readOnly}
                        onCheckedChange={(v) => updateRow(r.procurement_item_id, { is_selected: !!v })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/40 font-semibold">
                  <td className="p-2" colSpan={8}>Total (selected items)</td>
                  <td className="p-2 text-right" colSpan={2}>₹{fmtAmt(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Terms & notes */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Expected Payment Terms</Label>
              <Input value={req.expected_payment_terms || "-"} disabled className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Your Payment Term</Label>
              <Input
                value={paymentTerm}
                disabled={readOnly}
                onChange={(e) => setPaymentTerm(e.target.value)}
                placeholder="e.g. Net 30, Advance 50%"
                className="h-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Additional Notes</Label>
            <Textarea
              value={notes}
              disabled={readOnly}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any remarks for this quote"
              rows={3}
            />
          </div>

          {!readOnly && (
            <div className="flex flex-wrap gap-3 justify-end pt-2">
              <Button variant="outline" disabled={saving} onClick={() => send(false)}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Draft
              </Button>
              <Button disabled={saving} onClick={() => send(true)}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Submit Quote
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
