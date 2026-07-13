import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useModuleConfig } from "@/hooks/useModuleConfig";
import { useUserProfile } from "@/hooks/useUserProfile";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CalendarDays, Truck, FileText, Pencil, ChevronRight, ChevronDown, Save, ArrowRight, Undo2, Download, MessageCircle, Link2, Copy } from "lucide-react";
import {
  STATUS_FLOW, allowedTransitions, statusColor, fmtAmt, PAYMENT_TERMS, statusFlowFor, type ProcStatus,
} from "@/lib/procurement";
import jsPDF from "jspdf";
import { downloadPDF } from "@/utils/nativeDownload";
import GRNForm, { type POItem } from "./GRNForm";
import InvoiceForm from "./InvoiceForm";
import ThreeWayMatch from "./ThreeWayMatch";
import { fetchAddressOptions, formatAddressSnapshot, type AddressOption } from "@/lib/addresses";

export interface StageHistoryEntry {
  status: string;
  moved_by?: string | null;
  moved_by_name?: string | null;
  moved_at: string;
}

export interface DetailOrder {
  id: string;
  source_type?: string | null;
  order_date: string;
  vendor_id: string | null;
  vendor_ids: string[] | null;
  po_number: string | null;
  site_id: string | null;
  transfer_from_site_id?: string | null;
  status: string;
  payment_terms: string | null;
  expected_delivery_date: string | null;
  total_amount: number;
  estimated_budget: number | null;
  bill_to: string | null;
  ship_to: string | null;
  bill_to_address_id?: string | null;
  ship_to_address_id?: string | null;
  bill_to_gst?: string | null;
  ship_to_gst?: string | null;
  requisition_notes: string | null;
  created_by: string | null;
  stage_history?: StageHistoryEntry[] | any;
  procurement_items?: { id: string; product_id: string | null; rate: number; qty: number; uom: string | null; vendor_ids?: string[] | null; rate_source?: string | null; rate_source_vendor_id?: string | null }[];
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  order: DetailOrder;
  canApprove: boolean;
  currentUserId?: string;
  vendorName: (id: string | null) => string;
  siteName: (id: string | null) => string;
  productName: (id: string | null) => string;
  onEdit: (o: DetailOrder) => void;
  onChanged: () => void;
}

interface GrnRow { id: string; grn_number: string | null; receipt_date: string; status: string; received_by: string | null; remarks: string | null; }
interface GrnItemRow { grn_id: string; procurement_item_id: string | null; received_qty: number; }
interface InvRow { id: string; invoice_number: string | null; invoice_date: string; invoice_amount: number; }
interface InvItemRow { invoice_id: string; procurement_item_id: string | null; invoiced_rate: number; }

interface VendorQuoteItemRow {
  procurement_item_id: string | null;
  rate: number;
  discount_pct: number;
  rate_after_discount: number;
  delivery_commitment_date: string | null;
  is_selected: boolean;
}
interface VendorQuoteRow {
  id: string;
  vendor_id: string | null;
  token: string;
  status: string;
  vendor_payment_term: string | null;
  notes: string | null;
  submitted_at: string | null;
  procurement_item_ids?: string[] | null;
  procurement_vendor_quote_items?: VendorQuoteItemRow[];
}

interface RateLine {
  id: string;
  product_id: string | null;
  uom: string | null;
  qty: number;
  rate: string;
  vendor_ids: string[];
  rate_source: string | null;
  rate_source_vendor_id: string | null;
}

// Reusable multi-select vendor picker (popover + checkboxes)
function VendorMultiSelect({
  vendors, selectedIds, onChange, disabled, placeholder = "Select vendors",
}: {
  vendors: { id: string; name: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-8 w-full justify-between font-normal text-xs" disabled={disabled}>
          <span className="truncate text-left">
            {selectedIds.length === 0
              ? <span className="text-muted-foreground">{placeholder}</span>
              : vendors.filter((v) => selectedIds.includes(v.id)).map((v) => v.name).join(", ")}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-2 max-h-64 overflow-y-auto" align="start">
        {vendors.length === 0 ? (
          <p className="text-xs text-muted-foreground p-2">No vendors found.</p>
        ) : vendors.map((v) => {
          const checked = selectedIds.includes(v.id);
          return (
            <label key={v.id} className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-muted cursor-pointer text-sm">
              <Checkbox
                checked={checked}
                onCheckedChange={(c) => onChange(c ? [...selectedIds, v.id] : selectedIds.filter((id) => id !== v.id))}
              />
              <span>{v.name}</span>
            </label>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

export default function ProcurementDetail({
  open, onOpenChange, order, canApprove, currentUserId,
  vendorName, siteName, productName, onEdit, onChanged,
}: Props) {
  const procCfg = useModuleConfig("procurement");
  const canEditRatesPostApproval = procCfg.canDo("editRatesAfterApproval");
  const { profile: currentProfile, isAdmin } = useUserProfile();
  const [grns, setGrns] = useState<GrnRow[]>([]);
  const [grnItems, setGrnItems] = useState<GrnItemRow[]>([]);
  const [invoices, setInvoices] = useState<InvRow[]>([]);
  const [invItems, setInvItems] = useState<InvItemRow[]>([]);
  const [grnOpen, setGrnOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);

  // Inline PO details editing (delivery date, payment terms, rates)
  const [poForm, setPoForm] = useState({ expected_delivery_date: "", payment_terms: "" });
  const [rateLines, setRateLines] = useState<RateLine[]>([]);
  const [poSaving, setPoSaving] = useState(false);
  const [addressOptions, setAddressOptions] = useState<AddressOption[]>([]);
  const [vendors, setVendors] = useState<{ id: string; name: string; phone: string | null; contact_person: string | null; email: string | null }[]>([]);
  const [vendorQuotes, setVendorQuotes] = useState<VendorQuoteRow[]>([]);
  const [genLinks, setGenLinks] = useState(false);
  // Bulk invite state: which line items + which vendors to invite in one action
  const [inviteItemIds, setInviteItemIds] = useState<string[]>([]);
  const [inviteVendorIds, setInviteVendorIds] = useState<string[]>([]);

  useEffect(() => {
    fetchAddressOptions().then(setAddressOptions).catch(() => {});
    supabase.from("vendors").select("id, name, phone, contact_person, email").order("name")
      .then(({ data }) => setVendors((data || []) as typeof vendors));
  }, []);

  // Sync inline editable fields whenever the order changes
  useEffect(() => {
    setPoForm({
      expected_delivery_date: order.expected_delivery_date || "",
      payment_terms: order.payment_terms || "",
    });
    setRateLines((order.procurement_items || []).map((it) => ({
      id: it.id, product_id: it.product_id, uom: it.uom, qty: it.qty, rate: String(it.rate ?? ""),
      vendor_ids: Array.isArray(it.vendor_ids) ? (it.vendor_ids as string[]) : [],
      rate_source: it.rate_source ?? null,
      rate_source_vendor_id: it.rate_source_vendor_id ?? null,
    })));
  }, [order]);

  const findAddr = (id: string) => addressOptions.find((a) => a.id === id) || null;

  const poEditTotal = useMemo(
    () => rateLines.reduce((s, l) => s + (parseFloat(l.rate) || 0) * (l.qty || 0), 0),
    [rateLines]
  );

  // Distinct vendors used across all line items (drives the read-only PO-level summary)
  const derivedVendorIds = useMemo(() => {
    const s = new Set<string>();
    rateLines.forEach((l) => (l.vendor_ids || []).forEach((v) => s.add(v)));
    return [...s];
  }, [rateLines]);

  const savePoDetails = async () => {
    setPoSaving(true);
    try {
      const { error: oErr } = await supabase.from("procurement_orders").update({
        expected_delivery_date: poForm.expected_delivery_date || null,
        payment_terms: poForm.payment_terms || null,
        vendor_ids: derivedVendorIds.length ? derivedVendorIds : null,
        vendor_id: derivedVendorIds[0] || null,
        total_amount: poEditTotal,
      }).eq("id", order.id);
      if (oErr) throw oErr;
      for (const l of rateLines) {
        const rate = parseFloat(l.rate) || 0;
        const { error: iErr } = await supabase.from("procurement_items")
          .update({
            rate, amount: rate * (l.qty || 0),
            vendor_ids: l.vendor_ids.length ? l.vendor_ids : null,
            rate_source: l.rate_source,
            rate_source_vendor_id: l.rate_source_vendor_id,
          }).eq("id", l.id);
        if (iErr) throw iErr;
      }
      toast.success("PO details updated");
      onChanged();
    } catch (err: any) {
      toast.error(err.message || "Failed to update PO details");
    } finally {
      setPoSaving(false);
    }
  };




  const items: POItem[] = useMemo(
    () => (order.procurement_items || []).map((it) => ({
      id: it.id, product_id: it.product_id, rate: it.rate, qty: it.qty, uom: it.uom,
    })),
    [order.procurement_items]
  );

  const fetchSub = useCallback(async () => {
    const [g, inv] = await Promise.all([
      supabase.from("procurement_grns").select("*, procurement_grn_items(*)").eq("po_id", order.id).order("created_at"),
      supabase.from("procurement_invoices").select("*, procurement_invoice_items(*)").eq("po_id", order.id).order("created_at"),
    ]);
    const gRows = (g.data || []) as any[];
    setGrns(gRows.map((r) => ({ id: r.id, grn_number: r.grn_number, receipt_date: r.receipt_date, status: r.status, received_by: r.received_by, remarks: r.remarks })));
    setGrnItems(gRows.flatMap((r) => (r.procurement_grn_items || []) as GrnItemRow[]));
    const iRows = (inv.data || []) as any[];
    setInvoices(iRows.map((r) => ({ id: r.id, invoice_number: r.invoice_number, invoice_date: r.invoice_date, invoice_amount: r.invoice_amount })));
    setInvItems(iRows.flatMap((r) => (r.procurement_invoice_items || []) as InvItemRow[]));
  }, [order.id]);

  useEffect(() => { if (open) fetchSub(); }, [open, fetchSub]);

  const receivedByItem = useMemo(() => {
    const m: Record<string, number> = {};
    grnItems.forEach((gi) => {
      if (gi.procurement_item_id) m[gi.procurement_item_id] = (m[gi.procurement_item_id] || 0) + Number(gi.received_qty || 0);
    });
    return m;
  }, [grnItems]);

  const invoicedRate = useMemo(() => {
    const m: Record<string, number> = {};
    invItems.forEach((ii) => { if (ii.procurement_item_id) m[ii.procurement_item_id] = Number(ii.invoiced_rate || 0); });
    return m;
  }, [invItems]);

  const invoiceTotal = useMemo(() => invoices.reduce((s, i) => s + Number(i.invoice_amount || 0), 0), [invoices]);

  const isTransfer = order.source_type === "internal_transfer";
  const transitions = allowedTransitions(order.status, order.source_type).filter((t) => !t.approver || canApprove);
  const editable = order.status === "Requisition";
  // After approval, admins can fill the remaining PO details (until goods are received) — vendor flow only
  const poUnlocked = !isTransfer && canApprove && ["Requisition Approved", "Quote Requested", "Quote Received", "PO Issued"].includes(order.status);
  // Editing rates once the PO has been issued is gated by the editRatesAfterApproval config
  const ratesLocked = order.status === "PO Issued" && !canEditRatesPostApproval;
  const canReceive = isTransfer
    ? canApprove && ["Requisition Approved", "Goods Received"].includes(order.status)
    : canApprove && ["PO Issued", "Goods Received"].includes(order.status);
  const canInvoice =
    !isTransfer && canApprove && ["Goods Received", "Invoice Received"].includes(order.status);

  const estBudget = isTransfer ? null : order.estimated_budget;
  const poValue = order.total_amount || 0;
  const variance = estBudget != null ? estBudget - poValue : null;
  const overBudget = estBudget != null && poValue > estBudget;

  const stageHistory: StageHistoryEntry[] = useMemo(
    () => (Array.isArray(order.stage_history) ? (order.stage_history as StageHistoryEntry[]) : []),
    [order.stage_history]
  );
  // Latest history entry per stage (for the mini activity log under each pill)
  const historyByStatus = useMemo(() => {
    const m: Record<string, StageHistoryEntry> = {};
    stageHistory.forEach((h) => { if (h?.status) m[h.status] = h; });
    return m;
  }, [stageHistory]);

  const moverName = currentProfile?.full_name || currentProfile?.username || "Unknown";

  const changeStatus = async (to: ProcStatus, closeAfter = true) => {
    setBusy(true);
    const entry: StageHistoryEntry = {
      status: to, moved_by: currentUserId ?? null, moved_by_name: moverName, moved_at: new Date().toISOString(),
    };
    const nextHistory = [...stageHistory, entry];
    const { error } = await supabase.from("procurement_orders")
      .update({ status: to, stage_history: nextHistory as any }).eq("id", order.id);
    setBusy(false);
    if (error) { toast.error(error.message || "Failed to update status"); return; }
    toast.success(`Status changed to ${to}`);
    onChanged();
    if (closeAfter) onOpenChange(false);
  };

  const applyTransition = (to: ProcStatus) => changeStatus(to);

  const stepFlow = statusFlowFor(order.source_type);
  const stepIndex = stepFlow.indexOf(order.status as ProcStatus);
  const nextStage = stepIndex >= 0 && stepIndex < stepFlow.length - 1 ? stepFlow[stepIndex + 1] : null;
  const prevStage = stepIndex > 0 ? stepFlow[stepIndex - 1] : null;
  // The immediate next transition (unfiltered) tells us whether approval rights are needed
  const nextTransition = allowedTransitions(order.status, order.source_type)[0] || null;
  const canAdvance = !!nextStage && (!nextTransition?.approver || canApprove);

  const reqName = order.po_number || "Requisition";
  const selectedVendors = vendors.filter((v) => derivedVendorIds.includes(v.id));
  const primaryVendor = selectedVendors[0] || null;
  const vendorNameById = useMemo(() => {
    const m: Record<string, string> = {};
    vendors.forEach((v) => { m[v.id] = v.name; });
    return m;
  }, [vendors]);
  // Vendor phone may be a JSONB array, a string, or null — normalise to a display string.
  const vendorPhoneStr = (phone: unknown): string => {
    if (!phone) return "";
    if (Array.isArray(phone)) return phone.filter(Boolean).map(String).join(", ");
    return String(phone);
  };


  const buildQuoteDoc = () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    let y = 18;
    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text("Quote Request", pageW / 2, y, { align: "center" });
    y += 10;
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    const line = (label: string, val: string) => {
      doc.setFont("helvetica", "bold"); doc.text(`${label}:`, 14, y);
      doc.setFont("helvetica", "normal"); doc.text(val || "-", 55, y);
      y += 6;
    };
    line("Requisition", reqName);
    line("Site", siteName(order.site_id) || "-");
    line("Raised Date", order.order_date || "-");
    if (order.expected_delivery_date) line("Expected Delivery", order.expected_delivery_date);
    if (order.payment_terms) line("Payment Terms", order.payment_terms);
    if (order.bill_to) line("Bill To", String(order.bill_to).replace(/\n/g, ", "));
    if (order.ship_to) line("Ship To", String(order.ship_to).replace(/\n/g, ", "));

    if (selectedVendors.length) {
      y += 2; doc.setFont("helvetica", "bold"); doc.text("Vendor(s):", 14, y); y += 6;
      doc.setFont("helvetica", "normal");
      selectedVendors.forEach((v) => {
        const parts = [v.name];
        if (v.contact_person) parts.push(`Attn: ${v.contact_person}`);
        if (v.phone) parts.push(`Ph: ${vendorPhoneStr(v.phone)}`);
        if (v.email) parts.push(v.email);
        doc.text(`• ${parts.join("  |  ")}`, 18, y); y += 6;
      });
    }

    y += 4;
    doc.setFont("helvetica", "bold");
    doc.text("#", 14, y); doc.text("Product", 24, y); doc.text("Qty", 150, y); doc.text("UOM", 170, y);
    y += 2; doc.line(14, y, pageW - 14, y); y += 6;
    doc.setFont("helvetica", "normal");
    (order.procurement_items || []).forEach((it, idx) => {
      if (y > 275) { doc.addPage(); y = 20; }
      doc.text(String(idx + 1), 14, y);
      const nm = doc.splitTextToSize(productName(it.product_id) || "-", 120);
      doc.text(nm, 24, y);
      doc.text(String(it.qty ?? ""), 150, y);
      doc.text(it.uom || "-", 170, y);
      y += Math.max(6, nm.length * 5);
    });
    return doc;
  };

  const generateQuotePdf = async () => {
    try {
      const doc = buildQuoteDoc();
      await downloadPDF(doc, `Quote-Request-${reqName}.pdf`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to generate PDF");
    }
  };

  // Upload the generated quote PDF to storage and return a public HTTPS link.
  const uploadQuotePdf = async (): Promise<string | null> => {
    try {
      const doc = buildQuoteDoc();
      const blob = doc.output("blob");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const path = `${user.id}/${Date.now()}-Quote-Request-${reqName.replace(/[^a-zA-Z0-9-_]/g, "_")}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("temp-downloads")
        .upload(path, blob, { contentType: "application/pdf", upsert: true });
      if (upErr) { console.error("Quote upload error:", upErr); return null; }
      const { data } = supabase.storage.from("temp-downloads").getPublicUrl(path);
      return data?.publicUrl ?? null;
    } catch (err) {
      console.error("uploadQuotePdf failed:", err);
      return null;
    }
  };

  const shareViaWhatsApp = async () => {
    // Open the tab synchronously so mobile/desktop popup blockers don't stop it after the await.
    const win = window.open("", "_blank");
    setBusy(true);
    try {
      const summaryLines = [
        `*Quote Request — ${reqName}*`,
        `Site: ${siteName(order.site_id) || "-"}`,
      ];
      if (primaryVendor) summaryLines.push(`Vendor: ${primaryVendor.name}`);
      if (order.bill_to) summaryLines.push(`Bill To: ${String(order.bill_to).replace(/\n/g, ", ")}`);
      if (order.ship_to) summaryLines.push(`Ship To: ${String(order.ship_to).replace(/\n/g, ", ")}`);
      if (order.expected_delivery_date) summaryLines.push(`Expected Delivery: ${order.expected_delivery_date}`);
      if (order.payment_terms) summaryLines.push(`Payment Terms: ${order.payment_terms}`);
      const items = (order.procurement_items || [])
        .map((it, i) => `${i + 1}. ${productName(it.product_id) || "-"} — ${it.qty ?? ""} ${it.uom || ""}`.trim());
      if (items.length) summaryLines.push("", "Items:", ...items);

      const link = await uploadQuotePdf();
      if (link) summaryLines.push("", `Full quote PDF: ${link}`);
      else toast.message("Sharing summary (PDF link unavailable)");

      const msg = summaryLines.join("\n");
      const phone = vendorPhoneStr(primaryVendor?.phone).replace(/[^\d]/g, "");
      const url = phone
        ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
        : `https://wa.me/?text=${encodeURIComponent(msg)}`;
      if (win) win.location.href = url;
      else window.open(url, "_blank");
    } catch (err: any) {
      toast.error(err?.message || "Failed to share via WhatsApp");
      if (win) win.close();
    } finally {
      setBusy(false);
    }
  };

  // ---- Vendor quote portal ----
  const loadVendorQuotes = useCallback(async () => {
    const { data } = await supabase
      .from("procurement_vendor_quotes")
      .select("id, vendor_id, token, status, vendor_payment_term, notes, submitted_at, procurement_vendor_quote_items(*)")
      .eq("po_id", order.id);
    const rows = (data || []) as VendorQuoteRow[];
    setVendorQuotes(rows);
    const map: Record<string, { token: string; vendor_id: string }> = {};
    rows.forEach((r) => { if (r.vendor_id) map[r.vendor_id] = { token: r.token, vendor_id: r.vendor_id }; });
    setQuoteLinks(map);
  }, [order.id]);

  useEffect(() => { if (open) loadVendorQuotes(); }, [open, loadVendorQuotes]);

  const quoteUrl = (token: string) => `${window.location.origin}/vendor-quote/${token}`;

  const generateQuoteLinks = async () => {
    if (selectedVendorIds.length === 0) {
      toast.error("Select at least one vendor first.");
      return;
    }
    setGenLinks(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      // Create a quote row per vendor that doesn't already have one
      const existing = new Set(vendorQuotes.map((q) => q.vendor_id));
      const toCreate = selectedVendorIds.filter((id) => !existing.has(id));
      if (toCreate.length) {
        const { error } = await supabase.from("procurement_vendor_quotes").insert(
          toCreate.map((vid) => ({ po_id: order.id, vendor_id: vid, token: crypto.randomUUID().replace(/-/g, ""), created_by: user?.id ?? null }))
        );
        if (error) throw error;
      }
      await loadVendorQuotes();
      toast.success("Quote links ready. Share them with vendors below.");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate quote links");
    } finally {
      setGenLinks(false);
    }
  };

  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(quoteUrl(token));
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const shareLinkWhatsApp = (vendorId: string, token: string) => {
    const v = vendors.find((x) => x.id === vendorId);
    const link = quoteUrl(token);
    const msg = [
      `*Quote Request — ${reqName}*`,
      v ? `To: ${v.name}` : "",
      `Site: ${siteName(order.site_id) || "-"}`,
      "",
      "Please fill your rates, discount and delivery commitment here:",
      link,
    ].filter(Boolean).join("\n");
    const phone = vendorPhoneStr(v?.phone).replace(/[^\d]/g, "");
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  };

  const applyVendorRates = async (q: VendorQuoteRow) => {
    setPoSaving(true);
    try {
      const qItems = q.procurement_vendor_quote_items || [];
      const byItem: Record<string, VendorQuoteItemRow> = {};
      qItems.forEach((qi) => { if (qi.procurement_item_id) byItem[qi.procurement_item_id] = qi; });
      let total = 0;
      for (const l of rateLines) {
        const qi = byItem[l.id];
        if (!qi) continue;
        const rate = Number(qi.rate_after_discount) || 0;
        total += rate * (l.qty || 0);
        const { error } = await supabase.from("procurement_items")
          .update({ rate, amount: rate * (l.qty || 0) }).eq("id", l.id);
        if (error) throw error;
      }
      const patch: Record<string, unknown> = { total_amount: total, vendor_id: q.vendor_id, vendor_ids: q.vendor_id ? [q.vendor_id] : null };
      if (q.vendor_payment_term) patch.payment_terms = q.vendor_payment_term;
      await supabase.from("procurement_orders").update(patch).eq("id", order.id);
      toast.success("Vendor rates applied to this requisition");
      onChanged();
    } catch (err: any) {
      toast.error(err.message || "Failed to apply vendor rates");
    } finally {
      setPoSaving(false);
    }
  };







  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-screen h-screen sm:rounded-none p-0 gap-0 flex flex-col">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {order.po_number || (isTransfer ? "(No TRF #)" : "(No PO #)")}
            <Badge variant="outline" className={`text-[10px] ${isTransfer ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}`}>{isTransfer ? "Internal Transfer" : "Vendor PO"}</Badge>
            <Badge variant="outline" className={`text-[10px] ${statusColor(order.status)}`}>{order.status}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 p-4 overflow-y-auto flex-1 w-full max-w-6xl mx-auto">
          {/* Stepper + stage controls */}
          {order.status !== "Rejected" && (
            <div className="space-y-3">
              <div className="flex items-start gap-1 flex-wrap pb-1">
                {stepFlow.map((s, i) => {
                  const h = historyByStatus[s];
                  const when = h?.moved_at ? new Date(h.moved_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;
                  return (
                    <div key={s} className="flex items-start shrink-0">
                      <div className="flex flex-col items-center gap-1 max-w-[92px]">
                        <span className={`text-[10px] px-2 py-1 rounded-full whitespace-nowrap ${i <= stepIndex ? statusColor(s) : "bg-muted text-muted-foreground"}`}>{s}</span>
                        {i <= stepIndex && h && (
                          <span className="text-[9px] text-muted-foreground text-center leading-tight">
                            {h.moved_by_name || "—"}{when ? `, ${when}` : ""}
                          </span>
                        )}
                      </div>
                      {i < stepFlow.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground mt-1.5" />}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {nextStage && (
                  <Button
                    className="gap-1.5"
                    disabled={busy || !canAdvance}
                    onClick={() => setAdvanceOpen(true)}
                  >
                    Mark as {nextStage} <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
                {!canAdvance && nextStage && (
                  <span className="text-[11px] text-muted-foreground">Requires approval rights to advance.</span>
                )}
                {isAdmin && prevStage && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive underline underline-offset-2"
                    disabled={busy}
                    onClick={() => setRevertOpen(true)}
                  >
                    <Undo2 className="h-3.5 w-3.5" /> Revert to {prevStage}
                  </button>
                )}
              </div>
            </div>
          )}


          {/* Header info */}
          <Card>
            <CardContent className="p-3 space-y-1.5 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{order.order_date}</div>
              {isTransfer ? (
                <>
                  <div className="text-muted-foreground">Transfer From: <span className="font-medium text-foreground">{siteName(order.transfer_from_site_id)}</span></div>
                  <div className="text-muted-foreground">Transfer To: <span className="font-medium text-foreground">{siteName(order.site_id)}</span></div>
                  {order.po_number && <div className="text-muted-foreground">Transfer Number: <span className="font-medium text-foreground">{order.po_number}</span></div>}
                  {order.requisition_notes && <div className="text-muted-foreground">Reason: <span className="whitespace-pre-wrap">{order.requisition_notes}</span></div>}
                </>
              ) : (
                <>
                  <div>
                    <Label className="text-xs">Vendor(s)</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" className="h-9 w-full justify-between font-normal" disabled={!poUnlocked}>
                          <span className="truncate text-left">
                            {selectedVendorIds.length === 0
                              ? <span className="text-muted-foreground">Select vendors</span>
                              : selectedVendorIds.map((id) => vendorName(id)).join(", ")}
                          </span>
                          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-2 max-h-64 overflow-y-auto" align="start">
                        {vendors.length === 0 ? (
                          <p className="text-xs text-muted-foreground p-2">No vendors found.</p>
                        ) : vendors.map((v) => {
                          const checked = selectedVendorIds.includes(v.id);
                          return (
                            <label key={v.id} className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-muted cursor-pointer text-sm">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(c) =>
                                  setSelectedVendorIds((prev) => c ? [...prev, v.id] : prev.filter((id) => id !== v.id))
                                }
                              />
                              <span>{v.name}</span>
                            </label>
                          );
                        })}
                      </PopoverContent>
                    </Popover>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={generateQuotePdf}>
                        <Download className="h-3.5 w-3.5" /> Download Quote Request
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={generateQuoteLinks} disabled={genLinks}>
                        <Link2 className="h-3.5 w-3.5" /> {genLinks ? "Generating..." : "Generate Quote Links"}
                      </Button>
                    </div>

                    {/* Per-vendor quote links */}
                    {Object.keys(quoteLinks).length > 0 && (
                      <div className="mt-3 space-y-2 rounded-lg border p-2.5 bg-muted/30">
                        <p className="text-xs font-medium">Vendor Quote Links</p>
                        {Object.values(quoteLinks).map((ql) => {
                          const sub = vendorQuotes.find((q) => q.vendor_id === ql.vendor_id);
                          return (
                            <div key={ql.vendor_id} className="flex items-center gap-2 text-xs">
                              <span className="flex-1 truncate">{vendorName(ql.vendor_id)}</span>
                              {sub?.status === "submitted" ? (
                                <span className="text-emerald-600 dark:text-emerald-400 whitespace-nowrap">Submitted</span>
                              ) : (
                                <span className="text-muted-foreground whitespace-nowrap">Pending</span>
                              )}
                              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyLink(ql.token)} title="Copy link">
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-emerald-700 dark:text-emerald-400" onClick={() => shareLinkWhatsApp(ql.vendor_id, ql.token)} title="Share on WhatsApp">
                                <MessageCircle className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Submitted quotes comparison */}
                    {vendorQuotes.some((q) => q.status === "submitted") && (
                      <div className="mt-3 space-y-2 rounded-lg border p-2.5">
                        <p className="text-xs font-medium">Submitted Vendor Quotes</p>
                        {vendorQuotes.filter((q) => q.status === "submitted").map((q) => {
                          const total = (q.procurement_vendor_quote_items || []).reduce(
                            (s, it) => s + (Number(it.rate_after_discount) || 0), 0
                          );
                          return (
                            <div key={q.id} className="flex items-center gap-2 text-xs border-t pt-2 first:border-t-0 first:pt-0">
                              <div className="flex-1">
                                <div className="font-medium">{vendorName(q.vendor_id || "")}</div>
                                <div className="text-muted-foreground">
                                  {q.vendor_payment_term ? `Terms: ${q.vendor_payment_term} · ` : ""}
                                  Line total (unit): {fmtAmt(total)}
                                </div>
                              </div>
                              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={!poUnlocked || poSaving} onClick={() => applyVendorRates(q)}>
                                Apply Rates
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>


                  <div className="text-muted-foreground">Site: {siteName(order.site_id)}</div>
                  {order.po_number && <div className="text-muted-foreground">PO Number: <span className="font-medium text-foreground">{order.po_number}</span></div>}
                  {order.expected_delivery_date && <div className="text-muted-foreground">Expected Delivery: {order.expected_delivery_date}</div>}
                  {order.payment_terms && <div className="text-muted-foreground">Payment Terms: {order.payment_terms}</div>}
                  {order.bill_to && <div className="text-muted-foreground">Bill To: <span className="whitespace-pre-wrap">{order.bill_to}</span>{order.bill_to_gst && <span className="block">GST: {order.bill_to_gst}</span>}</div>}
                  {order.ship_to && <div className="text-muted-foreground">Ship To: <span className="whitespace-pre-wrap">{order.ship_to}</span>{order.ship_to_gst && <span className="block">GST: {order.ship_to_gst}</span>}</div>}
                  {order.requisition_notes && <div className="text-muted-foreground">Reason: <span className="whitespace-pre-wrap">{order.requisition_notes}</span></div>}

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t mt-2">
                    <div>
                      <Label className="text-xs">Expected Delivery Date</Label>
                      <Input
                        type="date" className="h-9"
                        value={poForm.expected_delivery_date}
                        disabled={!poUnlocked}
                        onChange={(e) => setPoForm((p) => ({ ...p, expected_delivery_date: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Payment Terms</Label>
                      <Select value={poForm.payment_terms} onValueChange={(v) => setPoForm((p) => ({ ...p, payment_terms: v }))} disabled={!poUnlocked}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Select terms" /></SelectTrigger>
                        <SelectContent>{PAYMENT_TERMS.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  {!poUnlocked && (
                    <p className="text-[11px] text-muted-foreground">Vendor(s), delivery date, payment terms and rates can be set once the requisition is approved.</p>
                  )}
                </>
              )}



            </CardContent>
          </Card>


          {/* Budget vs Actual */}
          {estBudget != null && (
            <Card className={overBudget ? "border-destructive/50" : "border-emerald-500/50"}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  Budget vs Actual {overBudget ? "⚠️" : "✅"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Estimated Budget</span><span className="font-medium">{fmtAmt(estBudget)}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">PO Value</span><span className="font-medium">{fmtAmt(poValue)}</span></div>
                <div className="flex items-center justify-between border-t pt-1.5">
                  <span className="text-muted-foreground">Variance</span>
                  <span className={`font-semibold ${overBudget ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                    {fmtAmt(variance ?? 0)}
                  </span>
                </div>
                <p className={`text-xs ${overBudget ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {overBudget ? "⚠️ PO exceeds the estimated budget." : "✅ Within estimated budget."}
                </p>
              </CardContent>
            </Card>
          )}


          {/* Line items */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">{isTransfer ? "Transfer Items" : "Line Items"}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {rateLines.map((l, i) => {
                const amt = (parseFloat(l.rate) || 0) * (l.qty || 0);
                return (
                  <div key={l.id} className="rounded-lg border p-2.5 bg-muted/30">
                    <div className="text-sm font-medium mb-1">{productName(l.product_id)}</div>
                    {isTransfer ? (
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Qty</Label>
                        <div className="h-8 flex items-center text-sm">{l.qty} {l.uom || ""}</div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 items-end">
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Qty</Label>
                          <div className="h-8 flex items-center text-sm">{l.qty} {l.uom || ""}</div>
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Rate</Label>
                          <Input
                            type="number" inputMode="decimal" value={l.rate} placeholder="0" className="h-8"
                            disabled={!poUnlocked || ratesLocked}
                            onChange={(e) => setRateLines((prev) => prev.map((x, idx) => idx === i ? { ...x, rate: e.target.value } : x))}
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Amount</Label>
                          <div className="h-8 flex items-center text-sm font-medium">{fmtAmt(amt)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {!isTransfer && (
                <div className="flex items-center justify-between pt-2 font-semibold">
                  <span>Grand Total</span><span className="text-primary">{fmtAmt(poUnlocked ? poEditTotal : order.total_amount)}</span>
                </div>
              )}
              {poUnlocked && (
                <Button className="w-full mt-2" onClick={savePoDetails} disabled={poSaving}>
                  <Save className="h-4 w-4 mr-2" />{poSaving ? "Saving..." : "Save PO Details & Rates"}
                </Button>
              )}
            </CardContent>

          </Card>

          {/* GRN list */}
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" />Goods Receipts</CardTitle>
              {canReceive && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setGrnOpen(true)}>Receive Goods</Button>}
            </CardHeader>
            <CardContent className="space-y-2">
              {grns.length === 0 ? (
                <p className="text-xs text-muted-foreground">No receipts yet.</p>
              ) : grns.map((g) => (
                <div key={g.id} className="flex items-center justify-between text-sm border-b last:border-b-0 py-1.5">
                  <div>
                    <div className="font-medium">{g.grn_number}</div>
                    <div className="text-[11px] text-muted-foreground">{g.receipt_date}{g.received_by ? ` · ${g.received_by}` : ""}</div>
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${statusColor(g.status)}`}>{g.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Invoice list (vendor only) */}
          {!isTransfer && (
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />Invoices</CardTitle>
              {canInvoice && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setInvOpen(true)}>Add Invoice</Button>}
            </CardHeader>
            <CardContent className="space-y-2">
              {invoices.length === 0 ? (
                <p className="text-xs text-muted-foreground">No invoices yet.</p>
              ) : invoices.map((i) => (
                <div key={i.id} className="flex items-center justify-between text-sm border-b last:border-b-0 py-1.5">
                  <div>
                    <div className="font-medium">{i.invoice_number}</div>
                    <div className="text-[11px] text-muted-foreground">{i.invoice_date}</div>
                  </div>
                  <div className="font-medium">{fmtAmt(i.invoice_amount)}</div>
                </div>
              ))}
            </CardContent>
          </Card>
          )}

          {/* 3-way match (vendor only) */}
          {!isTransfer && (grns.length > 0 || invoices.length > 0) && (
            <ThreeWayMatch
              items={items}
              received={receivedByItem}
              invoicedRate={invoicedRate}
              poTotal={order.total_amount}
              invoiceTotal={invoiceTotal}
              productName={productName}
            />
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2 pb-6">
            {editable && (
              <Button variant="outline" className="gap-1.5" onClick={() => onEdit(order)}><Pencil className="h-4 w-4" />Edit</Button>
            )}
          </div>
        </div>

        {/* Advance stage confirmation */}
        <AlertDialog open={advanceOpen} onOpenChange={setAdvanceOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Advance stage?</AlertDialogTitle>
              <AlertDialogDescription>
                Move this {isTransfer ? "transfer" : "requisition"} from <strong>{order.status}</strong> to <strong>{nextStage}</strong>?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={busy} onClick={() => { if (nextStage) changeStatus(nextStage, false); }}>
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Revert stage confirmation (admin only) */}
        <AlertDialog open={revertOpen} onOpenChange={setRevertOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revert to previous stage?</AlertDialogTitle>
              <AlertDialogDescription>
                Move this {isTransfer ? "transfer" : "requisition"} back from <strong>{order.status}</strong> to <strong>{prevStage}</strong>? Use this only to correct mistakes.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={busy} onClick={() => { if (prevStage) changeStatus(prevStage, false); }}>
                Revert
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>


        {grnOpen && (
          <GRNForm
            open={grnOpen} onOpenChange={setGrnOpen}
            poId={order.id} poNumber={order.po_number || (isTransfer ? "(No TRF #)" : "(No PO #)")}
            vendorId={isTransfer ? null : order.vendor_id}
            sourceType={order.source_type}
            transferFromSiteName={isTransfer ? siteName(order.transfer_from_site_id) : undefined}
            items={items} alreadyReceived={receivedByItem}
            productName={productName} createdBy={currentUserId}
            onSaved={() => { fetchSub(); onChanged(); }}
          />
        )}
        {invOpen && (
          <InvoiceForm
            open={invOpen} onOpenChange={setInvOpen}
            poId={order.id} poNumber={order.po_number || "(No PO #)"}
            vendorNameStr={vendorName(order.vendor_id)}
            items={items} productName={productName} createdBy={currentUserId}
            onSaved={() => { fetchSub(); onChanged(); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
