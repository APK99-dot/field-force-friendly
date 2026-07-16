import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, CheckCircle2, Building2, Upload, X, FileText, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const MAX_FILE_MB = 10;
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];

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
  quality_notes: string;
  is_selected: boolean;
}

interface Attachment { name: string; url: string; size: number; type: string; }

interface QuoteData {
  status: string;
  submitted_at: string | null;
  vendor_payment_term: string;
  notes: string;
  change_request_notes: string;
  attachments: Attachment[];
  terms_and_conditions: string[];
  terms_accepted_at: string | null;
  requisition: {
    title: string;
    po_number: string | null;
    order_date: string | null;
    expected_payment_terms: string;
    bill_to: string;
    ship_to: string;
    bill_to_gst: string;
    ship_to_gst: string;
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

const AddressBlock = ({ title, address, gst }: { title: string; address: string; gst: string }) => (
  <div className="rounded-lg border p-3 bg-muted/20">
    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</div>
    {address ? (
      <div className="text-sm whitespace-pre-line leading-snug">{address}</div>
    ) : (
      <div className="text-sm text-muted-foreground italic">Not specified</div>
    )}
    {gst && <div className="text-xs mt-1"><span className="text-muted-foreground">GST: </span><span className="font-medium">{gst}</span></div>}
  </div>
);

export default function VendorQuote() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<QuoteData | null>(null);
  const [rows, setRows] = useState<LineItem[]>([]);
  const [paymentTerm, setPaymentTerm] = useState("");
  const [notes, setNotes] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [changeMode, setChangeMode] = useState(false);
  const [changeNotes, setChangeNotes] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
          const safe = {
            ...body,
            attachments: Array.isArray(body.attachments) ? body.attachments : [],
            terms_and_conditions: Array.isArray(body.terms_and_conditions) ? body.terms_and_conditions : [],
            change_request_notes: body.change_request_notes || "",
            terms_accepted_at: body.terms_accepted_at || null,
            items: Array.isArray(body.items) ? body.items : [],
          };
          setData(safe);
          setRows(safe.items);
          setPaymentTerm(safe.vendor_payment_term || "");
          setNotes(safe.notes || "");
          setAttachments(safe.attachments);
          setChangeNotes(safe.change_request_notes);
          setSubmitted(safe.status === "submitted" || safe.status === "changes_requested");
          if (safe.terms_accepted_at) setTermsAccepted(true);
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

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      const next: Attachment[] = [];
      for (const file of Array.from(files)) {
        if (!ALLOWED_TYPES.includes(file.type)) {
          toast.error(`${file.name}: only PDF, JPG, PNG allowed`);
          continue;
        }
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          toast.error(`${file.name}: max ${MAX_FILE_MB}MB`);
          continue;
        }
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${token}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("vendor-quote-attachments")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          toast.error(`${file.name}: ${upErr.message}`);
          continue;
        }
        const { data: pub } = supabase.storage.from("vendor-quote-attachments").getPublicUrl(path);
        next.push({ name: file.name, url: pub.publicUrl, size: file.size, type: file.type });
      }
      if (next.length) setAttachments((prev) => [...prev, ...next]);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeAttachment = (idx: number) => setAttachments((prev) => prev.filter((_, i) => i !== idx));

  const send = async (mode: "draft" | "accept" | "request_changes") => {
    if (mode === "accept") {
      if (!termsAccepted) {
        toast.error("Please accept the Terms & Conditions to submit.");
        return;
      }
      const selected = rows.filter((r) => r.is_selected);
      if (selected.length === 0) {
        toast.error("Select at least one item you can supply.");
        return;
      }
      if (selected.some((r) => !r.rate || Number(r.rate) <= 0)) {
        toast.error("Enter a rate for every selected item.");
        return;
      }
    }
    if (mode === "request_changes" && !changeNotes.trim()) {
      toast.error("Please describe the changes you'd like.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        token,
        vendor_payment_term: paymentTerm,
        notes,
        mode,
        terms_accepted: termsAccepted,
        change_request_notes: changeNotes,
        attachments,
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
      if (mode === "accept") {
        setSubmitted(true);
        toast.success("Quote submitted. Thank you!");
      } else if (mode === "request_changes") {
        setSubmitted(true);
        toast.success("Change request sent to the buyer.");
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

  const { requisition: req, vendor, company, terms_and_conditions } = data;
  const readOnly = submitted;
  const hasTerms = terms_and_conditions.length > 0;
  const acceptDisabled = readOnly || saving || (hasTerms && !termsAccepted);

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
            {req.order_date && <p className="text-xs text-muted-foreground mt-1">Date: {fmtDate(req.order_date)}</p>}
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

          {/* Bill To / Ship To */}
          <div className="grid sm:grid-cols-2 gap-4">
            <AddressBlock title="Bill To" address={req.bill_to} gst={req.bill_to_gst} />
            <AddressBlock title="Ship To" address={req.ship_to} gst={req.ship_to_gst} />
          </div>

          {req.site_name && (
            <p className="text-sm">
              Kindly arrange to supply the following materials to site{" "}
              <span className="font-semibold">"{req.site_name}"</span>.
            </p>
          )}

          {submitted && (
            <div className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm ${
              data.status === "changes_requested"
                ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
            }`}>
              {data.status === "changes_requested" ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              {data.status === "changes_requested"
                ? `Your change request was sent${data.submitted_at ? ` on ${fmtDate(data.submitted_at)}` : ""}. The buyer will get back to you.`
                : `Your quote has been submitted${data.submitted_at ? ` on ${fmtDate(data.submitted_at)}` : ""}. Thank you.`}
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
                      <Input type="date" className="h-8 w-36" disabled={readOnly}
                        value={r.delivery_commitment_date || ""}
                        onChange={(e) => updateRow(r.procurement_item_id, { delivery_commitment_date: e.target.value })} />
                    </td>
                    <td className="p-2">
                      <Input type="number" min={0} className="h-8 w-24 text-right" disabled={readOnly}
                        value={r.rate ?? ""}
                        onChange={(e) => updateRow(r.procurement_item_id, { rate: e.target.value === "" ? null : Number(e.target.value) })} />
                    </td>
                    <td className="p-2">
                      <Input type="number" min={0} max={100} className="h-8 w-20 text-right" disabled={readOnly}
                        value={r.discount_pct ?? 0}
                        onChange={(e) => updateRow(r.procurement_item_id, { discount_pct: e.target.value === "" ? 0 : Number(e.target.value) })} />
                    </td>
                    <td className="p-2 text-right font-medium">{fmtAmt(rowAfter(r))}</td>
                    <td className="p-2 text-center">
                      <Checkbox checked={r.is_selected} disabled={readOnly}
                        onCheckedChange={(v) => updateRow(r.procurement_item_id, { is_selected: !!v })} />
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
            {req.expected_payment_terms && (
              <div className="space-y-1.5">
                <Label className="text-xs">Expected Payment Terms (from buyer)</Label>
                <Input value={req.expected_payment_terms} disabled className="h-9" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Vendor Payment Terms</Label>
              <Input
                value={paymentTerm}
                disabled={readOnly}
                onChange={(e) => setPaymentTerm(e.target.value)}
                placeholder="e.g. Net 30, Advance 50%"
                className="h-9"
              />
              <p className="text-xs text-muted-foreground">Please enter the payment terms you're proposing.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Additional Notes</Label>
            <Textarea value={notes} disabled={readOnly}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any remarks for this quote" rows={3} />
          </div>

          {/* Attachments */}
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Supporting Documents</div>
                <div className="text-xs text-muted-foreground">Optional. PDF, JPG or PNG, up to {MAX_FILE_MB}MB each.</div>
              </div>
              {!readOnly && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    multiple
                    accept=".pdf,image/jpeg,image/png"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                  <Button type="button" size="sm" variant="outline" disabled={uploading}
                    onClick={() => fileRef.current?.click()}>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                    Upload
                  </Button>
                </>
              )}
            </div>
            {attachments.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">No files attached.</div>
            ) : (
              <ul className="space-y-1">
                {attachments.map((a, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm border rounded px-2 py-1.5">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <a href={a.url} target="_blank" rel="noreferrer" className="flex-1 truncate hover:underline">{a.name}</a>
                    <span className="text-xs text-muted-foreground shrink-0">{(a.size / 1024).toFixed(0)} KB</span>
                    {!readOnly && (
                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6"
                        onClick={() => removeAttachment(idx)} title="Remove">
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Terms & Conditions */}
          {hasTerms && (
            <div className="space-y-2 rounded-lg border p-3 bg-muted/10">
              <div className="text-sm font-semibold">Terms &amp; Conditions</div>
              <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
                {terms_and_conditions.map((t, i) => <li key={i}>{t}</li>)}
              </ol>
              <label className="flex items-start gap-2 pt-2 text-sm cursor-pointer">
                <Checkbox
                  checked={termsAccepted}
                  disabled={readOnly}
                  onCheckedChange={(v) => setTermsAccepted(!!v)}
                  className="mt-0.5"
                />
                <span>I accept the Terms &amp; Conditions above</span>
              </label>
            </div>
          )}

          {/* Change request notes */}
          {(changeMode || (readOnly && data.change_request_notes)) && (
            <div className="space-y-1.5">
              <Label className="text-xs">Changes you're requesting</Label>
              <Textarea
                value={changeNotes}
                disabled={readOnly}
                onChange={(e) => setChangeNotes(e.target.value)}
                placeholder="Explain what needs to change (e.g. rate, delivery date, a specific term)…"
                rows={4}
              />
            </div>
          )}

          {!readOnly && (
            <div className="flex flex-wrap gap-3 justify-end pt-2">
              <Button variant="outline" disabled={saving} onClick={() => send("draft")}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Draft
              </Button>
              {!changeMode ? (
                <>
                  <Button variant="secondary" disabled={saving} onClick={() => setChangeMode(true)}>
                    Request Changes
                  </Button>
                  <Button disabled={acceptDisabled} onClick={() => send("accept")}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Accept &amp; Submit Quote
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" disabled={saving} onClick={() => setChangeMode(false)}>
                    Cancel
                  </Button>
                  <Button variant="secondary" disabled={saving || !changeNotes.trim()}
                    onClick={() => send("request_changes")}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Send Change Request
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
