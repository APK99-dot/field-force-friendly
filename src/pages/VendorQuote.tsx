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
const GST_SLABS = [5, 12, 18, 28] as const;


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
  gst_percent: number;

  rate_after_discount: number | null;
  delivery_commitment_date: string | null;
  quality_notes: string;
  is_selected: boolean;
}

interface Attachment { name: string; url: string; size: number; type: string; }

interface QuoteData {
  status: string;
  submitted_at: string | null;
  first_submitted_at: string | null;
  last_resubmitted_at: string | null;
  reopened_at: string | null;
  vendor_payment_term: string;
  notes: string;
  change_request_notes: string;
  attachments: Attachment[];
  terms_and_conditions: string[];
  terms_accepted_at: string | null;
  term_responses: { term: string; response: "accept" | "change"; comment: string }[];
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
  const [termResponses, setTermResponses] = useState<Record<number, { response: "accept" | "change" | ""; comment: string }>>({});
  // (legacy changeMode removed — change-request UX is now driven by per-term "Request Change")
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
            term_responses: Array.isArray(body.term_responses) ? body.term_responses : [],
            items: Array.isArray(body.items) ? body.items : [],
          };
          setData(safe);
          setRows((safe.items || []).map((it: LineItem) => ({ ...it, gst_percent: Number(it.gst_percent) || 0 })));
          setPaymentTerm(safe.vendor_payment_term || "");
          setNotes(safe.notes || "");
          setAttachments(safe.attachments);
          setChangeNotes(safe.change_request_notes);
          setSubmitted(safe.status === "submitted" || safe.status === "changes_requested");
          // Seed per-term responses. Fall back to accept if the quote was previously fully accepted.
          const seeded: Record<number, { response: "accept" | "change" | ""; comment: string }> = {};
          (safe.terms_and_conditions as string[]).forEach((term, i) => {
            const saved = (safe.term_responses as any[]).find((r) => r.term === term);
            if (saved) seeded[i] = { response: saved.response, comment: saved.comment || "" };
            else if (safe.terms_accepted_at) seeded[i] = { response: "accept", comment: "" };
            else seeded[i] = { response: "", comment: "" };
          });
          setTermResponses(seeded);
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

  const rowBreakup = (r: LineItem) => {
    const taxable = rowAfter(r) * (r.qty || 0);
    const gst = taxable * ((Number(r.gst_percent) || 0) / 100);
    return { taxable, gst, total: taxable + gst };
  };

  const totals = useMemo(() => {
    let taxable = 0, gst = 0;
    rows.forEach((r) => { const b = rowBreakup(r); taxable += b.taxable; gst += b.gst; });
    return { taxable, gst, grand: taxable + gst };
  }, [rows]);
  const total = totals.grand;


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
    const terms = data?.terms_and_conditions || [];
    const responsesList = terms.map((term, i) => ({
      term,
      response: (termResponses[i]?.response || "accept") as "accept" | "change",
      comment: (termResponses[i]?.comment || "").trim(),
    }));
    const allAccepted = terms.length === 0 || terms.every((_, i) => termResponses[i]?.response === "accept");
    const anyChange = terms.some((_, i) => termResponses[i]?.response === "change");

    if (mode === "accept") {
      if (!paymentTerm.trim()) {
        toast.error("Please enter your Vendor Payment Terms before submitting.");
        return;
      }
      if (terms.length && !allAccepted) {
        toast.error("Please Accept every Term & Condition to submit the quote. Use 'Send Change Request' if you need modifications.");
        return;
      }
      if (rows.some((r) => !r.rate || Number(r.rate) <= 0)) {
        toast.error("Enter a rate for every item.");
        return;
      }
    }
    if (mode === "request_changes") {
      if (!anyChange) {
        toast.error("Mark at least one Term & Condition as 'Request Change' before sending.");
        return;
      }
      if (!changeNotes.trim()) {
        toast.error("Please describe the changes you'd like.");
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        token,
        vendor_payment_term: paymentTerm,
        notes,
        mode,
        terms_accepted: mode === "accept" && terms.length > 0 && allAccepted,
        change_request_notes: changeNotes,
        attachments,
        term_responses: responsesList,
        items: rows.map((r) => ({
          procurement_item_id: r.procurement_item_id,
          rate: Number(r.rate) || 0,
          discount_pct: Number(r.discount_pct) || 0,
          gst_percent: Number(r.gst_percent) || 0,

          delivery_commitment_date: r.delivery_commitment_date || null,
          quality_notes: r.quality_notes || null,
          is_selected: true,
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
      const nowIso = new Date().toISOString();
      if (mode === "accept") {
        setData((prev) => {
          if (!prev) return prev;
          const isResubmit = !!prev.first_submitted_at;
          return {
            ...prev,
            status: "submitted",
            submitted_at: nowIso,
            first_submitted_at: prev.first_submitted_at || nowIso,
            last_resubmitted_at: isResubmit ? nowIso : prev.last_resubmitted_at,
          };
        });
        setSubmitted(true);
        toast.success("Quote submitted. Thank you!");
      } else if (mode === "request_changes") {
        setData((prev) => prev ? { ...prev, status: "changes_requested", submitted_at: prev.submitted_at || nowIso } : prev);
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
  const allTermsAccepted = hasTerms && terms_and_conditions.every((_, i) => termResponses[i]?.response === "accept");
  const anyChangeRequested = terms_and_conditions.some((_, i) => termResponses[i]?.response === "change");
  const acceptDisabled = readOnly || saving || !paymentTerm.trim() || (hasTerms && !allTermsAccepted);
  const changeRequestDisabled = readOnly || saving || !anyChangeRequested || !changeNotes.trim();

  // Success screen — shown once vendor has submitted their quote.
  if (submitted && data.status === "submitted") {
    const submittedOn = fmtDate(data.submitted_at) || fmtDate(new Date().toISOString());
    return (
      <div className="min-h-screen bg-muted/20 py-6 px-3 sm:px-6 flex items-center justify-center">
        <div className="mx-auto w-full max-w-lg bg-background rounded-2xl shadow-lg border overflow-hidden">
          <div className="flex items-center gap-4 p-5 border-b">
            <div className="w-14 h-14 rounded-lg border flex items-center justify-center overflow-hidden bg-white shrink-0">
              {company?.logo_url ? (
                <img src={company.logo_url} alt="Company logo" className="w-full h-full object-contain p-1" />
              ) : (
                <Building2 className="h-7 w-7 text-muted-foreground/50" />
              )}
            </div>
            <div>
              <div className="text-base font-bold">{company?.company_name || "Company"}</div>
              {req.title && <div className="text-xs text-muted-foreground">{req.title}</div>}
            </div>
          </div>
          <div className="p-8 sm:p-10 text-center">
            <div className="relative mx-auto mb-6 flex h-24 w-24 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-emerald-500/15 animate-ping" />
              <span className="absolute inset-2 rounded-full bg-emerald-500/25" />
              <CheckCircle2 className="relative h-16 w-16 text-emerald-600 dark:text-emerald-400 drop-shadow-sm" strokeWidth={2.2} />
            </div>
            <h1 className="text-2xl font-bold mb-2">Thank you!</h1>
            <p className="text-base text-foreground">
              Your quote has been submitted on{" "}
              <span className="font-semibold">{submittedOn}</span>.
            </p>
            {data.last_resubmitted_at && data.first_submitted_at && data.last_resubmitted_at !== data.first_submitted_at && (
              <p className="text-xs text-muted-foreground mt-1">
                Originally submitted on {fmtDate(data.first_submitted_at)} · Resubmitted on {fmtDate(data.last_resubmitted_at)}
              </p>
            )}
            <p className="text-sm text-muted-foreground mt-3">
              We've received your quotation and will get back to you shortly. This link is now read-only.
            </p>
            {vendor?.name && (
              <div className="mt-6 inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                {vendor.name}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-muted/20 py-4 px-4 sm:px-5 lg:px-6">
      <div className="w-full bg-background rounded-xl shadow-md border overflow-hidden">
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

        <div className="p-4 sm:p-5 space-y-5">
          <div className="text-center">
            <h1 className="text-xl font-bold">Indent Order</h1>
            {req.title && <p className="text-sm text-muted-foreground mt-0.5">{req.title}</p>}
            {req.order_date && <p className="text-xs text-muted-foreground mt-1">Date: {fmtDate(req.order_date)}</p>}
          </div>

          {/* From / To */}
          <div className="text-sm">
            <div className="font-semibold">To:</div>
            <div>{vendor?.name || "-"}</div>
            {vendor?.contact_person && <div className="text-muted-foreground">Attn: {vendor.contact_person}</div>}
            {vendor?.address && <div className="text-muted-foreground">{vendor.address}</div>}
          </div>

          {/* Bill To / Ship To */}
          <div className="grid sm:grid-cols-2 gap-4 w-full">
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

          {data.status === "reopened" && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-300 space-y-1">
              <div className="flex items-center gap-2 font-medium">
                <AlertCircle className="h-4 w-4" /> This quotation has been reopened by the buyer for revision.
              </div>
              <div className="text-xs text-amber-700/90 dark:text-amber-200/90 pl-6">
                Your previous values are preserved. Update the required fields and resubmit.
                {data.first_submitted_at && <> Originally submitted on <span className="font-medium">{fmtDate(data.first_submitted_at)}</span>.</>}
                {data.reopened_at && <> Reopened on <span className="font-medium">{fmtDate(data.reopened_at)}</span>.</>}
              </div>
            </div>
          )}

          {data.status === "draft" && data.first_submitted_at && (
            <div className="text-xs text-muted-foreground">
              Draft in progress. Last resubmission: {fmtDate(data.last_resubmitted_at || data.first_submitted_at)}.
            </div>
          )}


          {/* Line items */}
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm min-w-[1100px]">
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
                  <th className="p-2 font-semibold text-right">GST %</th>
                  <th className="p-2 font-semibold text-right">Taxable</th>
                  <th className="p-2 font-semibold text-right">GST Amt</th>
                  <th className="p-2 font-semibold text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const b = rowBreakup(r);
                  return (
                  <tr key={r.procurement_item_id} className="border-t align-top">
                    <td className="p-2 font-medium">{r.product_name}</td>
                    <td className="p-2 text-muted-foreground">{r.product_description || "-"}</td>
                    <td className="p-2 text-right">{r.qty}</td>
                    <td className="p-2">{r.uom || "-"}</td>
                    <td className="p-2 max-w-[200px]">
                      <Textarea rows={2} className="text-xs min-h-[52px]" disabled={readOnly}
                        placeholder="Enter quality instructions"
                        value={r.quality_notes || ""}
                        onChange={(e) => updateRow(r.procurement_item_id, { quality_notes: e.target.value })} />
                    </td>
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
                      <Input type="number" min={0} max={100} step="0.01" className="h-8 w-20 text-right" disabled={readOnly}
                        value={r.discount_pct === 0 ? "" : r.discount_pct}
                        placeholder="0"
                        onChange={(e) => updateRow(r.procurement_item_id, { discount_pct: e.target.value === "" ? 0 : Number(e.target.value) })} />
                    </td>
                    <td className="p-2 text-right font-medium">{fmtAmt(rowAfter(r))}</td>
                    <td className="p-2">
                      <select
                        className="h-8 w-20 rounded-md border border-input bg-background px-2 text-right text-sm disabled:opacity-60"
                        disabled={readOnly}
                        aria-label="GST percentage"
                        value={String(r.gst_percent ?? 0)}
                        onChange={(e) => updateRow(r.procurement_item_id, { gst_percent: Number(e.target.value) })}
                      >
                        <option value="0">—</option>
                        {GST_SLABS.map((g) => <option key={g} value={g}>{g}%</option>)}
                      </select>
                    </td>
                    <td className="p-2 text-right">{fmtAmt(b.taxable)}</td>
                    <td className="p-2 text-right">{fmtAmt(b.gst)}</td>
                    <td className="p-2 text-right font-medium">{fmtAmt(b.total)}</td>
                  </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/40">
                <tr className="border-t">
                  <td className="p-2 text-right" colSpan={12}>Subtotal (Taxable)</td>
                  <td className="p-2 text-right">₹{fmtAmt(totals.taxable)}</td>
                </tr>
                <tr>
                  <td className="p-2 text-right" colSpan={12}>Total GST</td>
                  <td className="p-2 text-right">₹{fmtAmt(totals.gst)}</td>
                </tr>
                <tr className="border-t font-semibold">
                  <td className="p-2 text-right" colSpan={12}>Grand Total</td>
                  <td className="p-2 text-right">₹{fmtAmt(total)}</td>
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
              <Label className="text-xs">Vendor Payment Terms <span className="text-destructive">*</span></Label>
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
                    {/* Attachments live in a private bucket, so uploaded files
                        are listed by name rather than linked publicly. */}
                    <span className="flex-1 truncate">{a.name}</span>
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

          {/* Terms & Conditions — per-term response (buttons aligned right) */}
          {hasTerms && (
            <div className="space-y-3 rounded-lg border p-3 bg-muted/10">
              <div>
                <div className="text-sm font-semibold">Terms &amp; Conditions</div>
                <p className="text-xs text-muted-foreground">
                  For each term, choose <span className="font-medium">Accept</span> or{" "}
                  <span className="font-medium">Request Change</span>. If you request changes to any term,
                  describe them in the <span className="font-medium">"Changes you're requesting"</span> box below.
                </p>
              </div>
              <div className="space-y-2">
                {terms_and_conditions.map((t, i) => {
                  const resp = termResponses[i]?.response || "";
                  const setResp = (r: "accept" | "change") =>
                    setTermResponses((prev) => ({ ...prev, [i]: { response: r, comment: "" } }));
                  return (
                    <div key={i} className="rounded-md border bg-background p-2.5 flex items-start gap-3">
                      <div className="flex gap-2 text-sm flex-1 min-w-0">
                        <span className="font-medium text-muted-foreground shrink-0">{i + 1}.</span>
                        <span className="whitespace-pre-line">{t}</span>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => setResp("accept")}
                          className={`text-xs px-3 py-1 rounded border transition ${resp === "accept" ? "bg-emerald-100 border-emerald-500 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : "hover:bg-muted"}`}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => setResp("change")}
                          className={`text-xs px-3 py-1 rounded border transition ${resp === "change" ? "bg-amber-100 border-amber-500 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" : "hover:bg-muted"}`}
                        >
                          Request Change
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {!readOnly && anyChangeRequested && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  You have requested changes on one or more terms. Describe them in the "Changes you're requesting" box and click <span className="font-medium">Send Change Request</span>.
                </p>
              )}
            </div>
          )}

          {/* Change request notes — visible whenever a change is requested or previously submitted */}
          {(anyChangeRequested || (readOnly && data.change_request_notes)) && (
            <div className="space-y-1.5">
              <Label className="text-xs">
                Changes you're requesting {anyChangeRequested && <span className="text-destructive">*</span>}
              </Label>
              <Textarea
                value={changeNotes}
                disabled={readOnly}
                onChange={(e) => setChangeNotes(e.target.value)}
                placeholder="Explain what needs to change (e.g. rate, delivery date, or specific terms)…"
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
              <Button
                variant="secondary"
                disabled={changeRequestDisabled}
                onClick={() => send("request_changes")}
                title={!anyChangeRequested ? "Mark at least one term as 'Request Change'" : ""}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Send Change Request
              </Button>
              <Button disabled={acceptDisabled} onClick={() => send("accept")}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {data.status === "reopened" ? "Resubmit Quote" : "Accept & Submit Quote"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
