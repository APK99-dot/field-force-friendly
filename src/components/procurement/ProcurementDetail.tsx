import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react";
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useModuleConfig } from "@/hooks/useModuleConfig";
import { useUserProfile } from "@/hooks/useUserProfile";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CalendarDays, Truck, FileText, Pencil, ChevronRight, ChevronDown, ChevronUp, Save, ArrowRight, Undo2, Download, MessageCircle, Link2, Copy, Plus, Trash2, Search, X, Info } from "lucide-react";
import {
  STATUS_FLOW, allowedTransitions, statusColor, fmtAmt, PAYMENT_TERMS, statusFlowFor, type ProcStatus,
} from "@/lib/procurement";
import jsPDF from "jspdf";
import { downloadPDF } from "@/utils/nativeDownload";
import { buildPurchaseOrderPdf } from "@/utils/purchaseOrderPdf";
import GRNForm, { type POItem } from "./GRNForm";
import InvoiceForm from "./InvoiceForm";
import GRNDetail from "./GRNDetail";

import { fetchAddressOptions, formatAddressSnapshot, type AddressOption } from "@/lib/addresses";
import { resolveInvoiceFileUrl } from "@/utils/invoiceAttachments";
import { useUiMode, isLightning } from "@/hooks/useUiMode";
import { HighlightsPanel, PathBar, StageLabel } from "@/components/procurement/lightning/LightningShell";

export interface StageHistoryEntry {
  status: string;
  moved_by?: string | null;
  moved_by_name?: string | null;
  moved_at: string;
  note?: string | null;
  auto?: boolean;
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
  procurement_items?: { id: string; product_id: string | null; rate: number; qty: number; uom: string | null; gst_percent?: number | null; vendor_ids?: string[] | null; rate_source?: string | null; rate_source_vendor_id?: string | null }[];
}

export interface ProcurementDetailFocus {
  vendorId?: string | null;
  section?: "quote" | "invoices" | "grns" | "financials" | "po";
  invoiceId?: string | null;
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
  focus?: ProcurementDetailFocus | null;
  onFocusConsumed?: () => void;
}

interface GrnRow { id: string; grn_number: string | null; receipt_date: string; status: string; received_by: string | null; remarks: string | null; vendor_id: string | null; photos?: string[] | null; }
interface GrnItemRow { grn_id: string; procurement_item_id: string | null; received_qty: number; }
interface InvRow { id: string; invoice_number: string | null; invoice_date: string; invoice_amount: number; vendor_id: string | null; }
interface InvItemRow { invoice_id: string; procurement_item_id: string | null; invoiced_rate: number; }
interface InvPaymentRow { invoice_id: string; amount: number; payment_date: string | null; reference_number: string | null; notes?: string | null; }

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
  version?: number | null;
  is_latest?: boolean | null;
  vendor_payment_term: string | null;
  notes: string | null;
  submitted_at: string | null;
  first_submitted_at?: string | null;
  last_resubmitted_at?: string | null;
  reopened_at?: string | null;
  procurement_item_ids?: string[] | null;
  change_request_notes?: string | null;
  attachments?: { name: string; url: string; size: number; type: string }[] | null;
  term_responses?: { term: string; response: "accept" | "change"; comment: string }[] | null;
  procurement_vendor_quote_items?: VendorQuoteItemRow[];
}


interface RateLine {
  id: string;
  product_id: string | null;
  uom: string | null;
  qty: number;
  rate: string;
  gst_percent: number;
  vendor_ids: string[];
  rate_source: string | null;
  rate_source_vendor_id: string | null;
}

/** GST slabs applicable to the business */
export const GST_SLABS = [0, 5, 12, 18, 28] as const;

export function lineGstBreakup(rate: number, qty: number, gstPct: number) {
  const taxable = (Number(rate) || 0) * (Number(qty) || 0);
  const gstAmount = taxable * ((Number(gstPct) || 0) / 100);
  return { taxable, gstAmount, total: taxable + gstAmount };
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

const fmtDT = (iso?: string | null) => iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";


export default function ProcurementDetail({
  open, onOpenChange, order, canApprove, currentUserId,
  vendorName, siteName, productName, onEdit, onChanged,
  focus, onFocusConsumed,
}: Props) {
  const procCfg = useModuleConfig("procurement");
  const canEditRatesPostApproval = procCfg.canDo("editRatesAfterApproval");
  const { profile: currentProfile, isAdmin } = useUserProfile();
  const [uiMode] = useUiMode();
  const lightning = isLightning(uiMode);
  const [stageHistoryOpen, setStageHistoryOpen] = useState(false);
  const [grns, setGrns] = useState<GrnRow[]>([]);
  const [grnItems, setGrnItems] = useState<GrnItemRow[]>([]);
  const [invoices, setInvoices] = useState<InvRow[]>([]);
  const [invItems, setInvItems] = useState<InvItemRow[]>([]);
  const [invPayments, setInvPayments] = useState<InvPaymentRow[]>([]);
  const [invAttachments, setInvAttachments] = useState<{ id: string; invoice_id: string; file_name: string; file_path: string; file_size: number | null }[]>([]);
  const [grnOpen, setGrnOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);
  const [selectedGrn, setSelectedGrn] = useState<GrnRow | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [payForm, setPayForm] = useState<{ open: boolean; payment_date: string; amount: string; reference: string; notes: string }>({ open: false, payment_date: new Date().toISOString().slice(0, 10), amount: "", reference: "", notes: "" });
  const [paySaving, setPaySaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);
  const [poDocs, setPoDocs] = useState<{ id: string; vendor_id: string | null; file_name: string; file_path: string; file_size: number | null; version: number | null; notes: string | null; created_at: string; created_by: string | null }[]>([]);
  const [poDocBusy, setPoDocBusy] = useState<string | null>(null);
  const [companyProfile, setCompanyProfile] = useState<any | null>(null);

  // Inline PO details editing (delivery date, payment terms, rates)
  const [poForm, setPoForm] = useState({ expected_delivery_date: "", payment_terms: "" });
  const [rateLines, setRateLines] = useState<RateLine[]>([]);
  const [poSaving, setPoSaving] = useState(false);
  const [addressOptions, setAddressOptions] = useState<AddressOption[]>([]);
  const [vendors, setVendors] = useState<{ id: string; name: string; phone: string | null; contact_person: string | null; email: string | null }[]>([]);
  const [allVendorQuotes, setAllVendorQuotes] = useState<VendorQuoteRow[]>([]);
  const vendorQuotes = useMemo(
    () => allVendorQuotes.filter((q) => q.is_latest !== false),
    [allVendorQuotes]
  );
  const setVendorQuotes = (updater: React.SetStateAction<VendorQuoteRow[]>) => {
    setAllVendorQuotes((prev) => {
      const next = typeof updater === "function" ? (updater as (p: VendorQuoteRow[]) => VendorQuoteRow[])(prev.filter((q) => q.is_latest !== false)) : updater;
      // Merge back: keep non-latest rows untouched, replace latest set with `next`.
      const nextIds = new Set(next.map((q) => q.id));
      const kept = prev.filter((q) => q.is_latest === false || nextIds.has(q.id));
      // Preserve ordering by version desc if we lost anything
      const merged = [...next, ...kept.filter((q) => !nextIds.has(q.id))];
      return merged;
    });
  };
  const vendorQuoteHistoryByVendor = useMemo(() => {
    const m: Record<string, VendorQuoteRow[]> = {};
    for (const q of allVendorQuotes) {
      const k = q.vendor_id || "";
      if (!k) continue;
      (m[k] ||= []).push(q);
    }
    Object.values(m).forEach((arr) => arr.sort((a, b) => (b.version || 0) - (a.version || 0)));
    return m;
  }, [allVendorQuotes]);
  const [viewQuoteId, setViewQuoteId] = useState<string | null>(null);
  const [genLinks, setGenLinks] = useState(false);
  const lineItemsRef = useRef<HTMLDivElement>(null);
  // Vendor assignment table state: one row per vendor
  const [vendorAssignments, setVendorAssignments] = useState<{ key: string; vendor_id: string; line_ids: string[]; scope: "all" | "specific" }[]>([]);
  const [scopePickerFor, setScopePickerFor] = useState<string | null>(null);
  const [vendorPickerFor, setVendorPickerFor] = useState<string | null>(null);
  const [vendorSearch, setVendorSearch] = useState("");
  const [expandedVendorRow, setExpandedVendorRow] = useState<string | null>(null);

  // Apply external focus: expand target vendor row, and if an invoice is targeted, open it.
  useEffect(() => {
    if (!focus || !open) return;
    if (focus.vendorId) setExpandedVendorRow(focus.vendorId);
  }, [focus, open, order.id]);
  useEffect(() => {
    if (!focus?.invoiceId || !open) return;
    const inv = invoices.find((i) => i.id === focus.invoiceId);
    if (inv) {
      setSelectedInvoiceId(inv.id);
      setInvOpen(true);
      onFocusConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.invoiceId, invoices, open]);
  const [showAllLines, setShowAllLines] = useState(false);
  const comparisonStorageKey = `vendor-comparison-collapsed:${order.id}`;
  const [comparisonCollapsed, setComparisonCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(comparisonStorageKey) === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(comparisonStorageKey, comparisonCollapsed ? "1" : "0"); } catch { /* ignore */ }
  }, [comparisonCollapsed, comparisonStorageKey]);
  const [comparisonSort, setComparisonSort] = useState<"rate" | "delivery" | "discount" | "payment">("rate");
  const [comparisonFilter, setComparisonFilter] = useState<"all" | "quoted" | "selected">("all");
  // Vendor picker for GRN / Invoice creation (which vendor is this receipt / bill for?)
  const [grnVendorId, setGrnVendorId] = useState<string | null>(null);
  const [invVendorId, setInvVendorId] = useState<string | null>(null);
  // When a vendor row is clicked, the GRN/Invoice forms open scoped to only that vendor.
  const [scopedVendorId, setScopedVendorId] = useState<string | null>(null);

  useEffect(() => {
    fetchAddressOptions().then(setAddressOptions).catch(() => {});
    supabase.from("vendors").select("id, name, phone, contact_person, email").order("name")
      .then(({ data }) => setVendors((data || []) as typeof vendors));
  }, []);

  const lastServerPoRef = useRef<{ expected_delivery_date: string; payment_terms: string; order_id: string | null }>({
    expected_delivery_date: "", payment_terms: "", order_id: null,
  });
  useEffect(() => {
    // Case-normalize payment_terms against the canonical PAYMENT_TERMS options
    // so a stored "net 30" matches the "Net 30" Select option instead of rendering blank.
    const rawPt = (order.payment_terms || "").trim();
    const normalizedPt = PAYMENT_TERMS.find((t) => t.toLowerCase() === rawPt.toLowerCase()) || rawPt;
    const serverDate = order.expected_delivery_date || "";
    const prev = lastServerPoRef.current;
    setPoForm((cur) => {
      // Preserve user edits that haven't been saved yet: only overwrite a field
      // when the local value still equals the previously-seen server value
      // (i.e. the user hasn't touched it since the last sync).
      const sameOrder = prev.order_id === order.id;
      const nextDate = !sameOrder || cur.expected_delivery_date === prev.expected_delivery_date
        ? serverDate : cur.expected_delivery_date;
      const nextPt = !sameOrder || cur.payment_terms === prev.payment_terms
        ? normalizedPt : cur.payment_terms;
      return { expected_delivery_date: nextDate, payment_terms: nextPt };
    });
    lastServerPoRef.current = { expected_delivery_date: serverDate, payment_terms: normalizedPt, order_id: order.id };
    const lines = (order.procurement_items || []).map((it) => ({
      id: it.id, product_id: it.product_id, uom: it.uom, qty: it.qty, rate: String(it.rate ?? ""),
      gst_percent: Number(it.gst_percent ?? 0),
      vendor_ids: Array.isArray(it.vendor_ids) ? (it.vendor_ids as string[]) : [],
      rate_source: it.rate_source ?? null,
      rate_source_vendor_id: it.rate_source_vendor_id ?? null,
    }));
    setRateLines(lines);
    // Rebuild the vendor-assignment rows from line items (one row per unique vendor)
    const map: Record<string, string[]> = {};
    lines.forEach((l) => (l.vendor_ids || []).forEach((vid) => {
      if (!map[vid]) map[vid] = [];
      map[vid].push(l.id);
    }));
    setVendorAssignments(Object.entries(map).map(([vid, ids]) => ({
      key: vid, vendor_id: vid, line_ids: ids, scope: (ids.length === lines.length ? "all" : "specific") as "all" | "specific",
    })));
  }, [order]);

  // Sync vendorAssignments -> rateLines vendor_ids so Save PO Details persists the change.
  const syncLinesFromAssignments = useCallback((rows: { vendor_id: string; line_ids: string[] }[]) => {
    setRateLines((prev) => prev.map((l) => {
      const vids = rows
        .filter((r) => r.vendor_id && r.line_ids.includes(l.id))
        .map((r) => r.vendor_id);
      return { ...l, vendor_ids: Array.from(new Set(vids)) };
    }));
  }, []);

  const updateAssignment = (key: string, patch: Partial<{ vendor_id: string; line_ids: string[]; scope: "all" | "specific" }>) => {
    const nextAssign = vendorAssignments.map((r) => (r.key === key ? { ...r, ...patch } : r));
    setVendorAssignments(nextAssign);

    // Compute new rateLines from assignments and persist any vendor_ids changes to DB
    const nextLines = rateLines.map((l) => {
      const vids = nextAssign
        .filter((r) => r.vendor_id && r.line_ids.includes(l.id))
        .map((r) => r.vendor_id);
      return { ...l, vendor_ids: Array.from(new Set(vids)) };
    });
    setRateLines(nextLines);
    const affected = nextLines.filter((nl, i) => {
      const prev = rateLines[i]?.vendor_ids || [];
      const a = [...prev].sort().join(",");
      const b = [...nl.vendor_ids].sort().join(",");
      return a !== b;
    });
    if (affected.length) {
      Promise.all(
        affected.map((l) =>
          supabase.from("procurement_items")
            .update({ vendor_ids: l.vendor_ids.length ? l.vendor_ids : null })
            .eq("id", l.id)
        )
      ).catch(() => {});
    }

    // If a quote already exists for this vendor and line_ids changed, persist the new scope
    const row = nextAssign.find((r) => r.key === key);
    if (row && patch.line_ids && row.vendor_id) {
      const existing = vendorQuotes.find((q) => q.vendor_id === row.vendor_id);
      if (existing) {
        supabase.from("procurement_vendor_quotes")
          .update({ procurement_item_ids: row.line_ids })
          .eq("id", existing.id)
          .then(({ error }) => { if (!error) loadVendorQuotes(); });
      }
    }
  };
  const addAssignmentRow = () => {
    setVendorAssignments((prev) => [
      ...prev,
      { key: crypto.randomUUID(), vendor_id: "", line_ids: rateLines.map((l) => l.id), scope: "all" },
    ]);
  };
  const removeAssignmentRow = async (key: string) => {
    const removed = vendorAssignments.find((r) => r.key === key);
    const removedVendorId = removed?.vendor_id || "";
    const next = vendorAssignments.filter((r) => r.key !== key);
    setVendorAssignments(next);
    syncLinesFromAssignments(next);

    // Clear any "rate came from this vendor's quote" tag on line items,
    // and drop this vendor from each line's vendor_ids in the DB so the
    // Line Items section immediately stops attributing rates to a vendor
    // that is no longer assigned.
    if (removedVendorId) {
      const stillAssignedElsewhere = next.some((r) => r.vendor_id === removedVendorId);

      const affectedLines = rateLines.filter(
        (l) =>
          (l.vendor_ids || []).includes(removedVendorId) ||
          l.rate_source_vendor_id === removedVendorId
      );

      setRateLines((prev) =>
        prev.map((l) => {
          const clearedSource = l.rate_source_vendor_id === removedVendorId;
          return {
            ...l,
            vendor_ids: (l.vendor_ids || []).filter((v) => v !== removedVendorId),
            rate_source: clearedSource ? "manual" : l.rate_source,
            rate_source_vendor_id: clearedSource ? null : l.rate_source_vendor_id,
          };
        })
      );

      try {
        await Promise.all(
          affectedLines.map((l) => {
            const newVids = (l.vendor_ids || []).filter((v) => v !== removedVendorId);
            const clearedSource = l.rate_source_vendor_id === removedVendorId;
            return supabase
              .from("procurement_items")
              .update({
                vendor_ids: newVids.length ? newVids : null,
                ...(clearedSource
                  ? { rate_source: "manual", rate_source_vendor_id: null }
                  : {}),
              })
              .eq("id", l.id);
          })
        );

        // Delete this vendor's quote(s) for this PO so the "Submitted quotes
        // for this item" block and rate provenance tag disappear immediately.
        // (Skip if the same vendor still has another assignment row.)
        if (!stillAssignedElsewhere) {
          // Delete ALL versions of this vendor's quote (audit history included)
          // so the "Submitted quotes for this item" block and rate provenance
          // tag disappear immediately.
          const { data: allForVendor } = await supabase
            .from("procurement_vendor_quotes")
            .select("id")
            .eq("po_id", order.id)
            .eq("vendor_id", removedVendorId);
          const toDelete = (allForVendor || []).map((q) => q.id);
          if (toDelete.length) {
            await supabase
              .from("procurement_vendor_quote_items")
              .delete()
              .in("quote_id", toDelete);
            await supabase
              .from("procurement_vendor_quotes")
              .delete()
              .in("id", toDelete);
          }
          setVendorQuotes((prev) => prev.filter((q) => q.vendor_id !== removedVendorId));
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to clean up vendor data");
      }
    }
  };

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

  // Map procurement_item_id -> vendor_ids currently assigned to that line
  const itemVendorMap = useMemo(() => {
    const m: Record<string, string[]> = {};
    rateLines.forEach((l) => { m[l.id] = [...(l.vendor_ids || [])]; });
    return m;
  }, [rateLines]);

  // Per-vendor financial summary: line-item totals, invoice totals, payments, balance.
  // Base list on BOTH persisted line vendor_ids AND local assignment rows so vendors
  // appear immediately after being added, before Save.
  const summaryVendorIds = useMemo(() => {
    const s = new Set<string>();
    rateLines.forEach((l) => (l.vendor_ids || []).forEach((v) => v && s.add(v)));
    vendorAssignments.forEach((r) => { if (r.vendor_id) s.add(r.vendor_id); });
    return [...s];
  }, [rateLines, vendorAssignments]);

  const vendorSummaries = useMemo(() => {
    return summaryVendorIds.map((vid) => {
      const assigned = vendorAssignments.find((r) => r.vendor_id === vid);
      const scopedLineIds = assigned
        ? new Set(assigned.line_ids)
        : new Set(rateLines.filter((l) => (l.vendor_ids || []).includes(vid)).map((l) => l.id));
      const lineAmount = rateLines
        .filter((l) => scopedLineIds.has(l.id))
        .reduce((s, l) => s + (parseFloat(l.rate) || 0) * (l.qty || 0), 0);
      const vInvoices = invoices.filter((i) => i.vendor_id === vid);
      const invoicedTotal = vInvoices.reduce((s, i) => s + Number(i.invoice_amount || 0), 0);
      const invoiceIds = new Set(vInvoices.map((i) => i.id));
      const vPayments = invPayments.filter((p) => invoiceIds.has(p.invoice_id));
      const paidTotal = vPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
      return {
        vendor_id: vid,
        vendor_name: vendorName(vid),
        line_amount: lineAmount,
        invoiced_total: invoicedTotal,
        paid_total: paidTotal,
        balance_due: invoicedTotal - paidTotal,
        payments: vPayments,
        invoices: vInvoices,
      };
    });
  }, [summaryVendorIds, vendorAssignments, rateLines, invoices, invPayments, vendorName]);

  // "Selected/finalized" vendors — winners whose quote was applied to at least one line,
  // or the sole assigned vendor on a line. These drive the vendor-centric workflow cards.
  const finalizedVendorIds = useMemo(() => {
    const s = new Set<string>();
    rateLines.forEach((l) => {
      if ((l.rate_source === "quote" || l.rate_source === "manual_adjusted") && l.rate_source_vendor_id) {
        s.add(l.rate_source_vendor_id);
      } else if ((l.vendor_ids || []).length === 1 && l.vendor_ids![0]) {
        s.add(l.vendor_ids![0]);
      }
    });
    return [...s];
  }, [rateLines]);

  // -------- Per-vendor lifecycle status ---------------------------------
  // Independent status for each vendor row so one vendor completing GRN /
  // invoicing / payment does not force the whole PO forward.
  type VendorLifecycle =
    | "Assigned" | "Draft" | "Quote Submitted" | "PO Issued"
    | "Partially Received" | "Fully Received"
    | "Partially Invoiced" | "Fully Invoiced"
    | "Partially Paid" | "Paid";
  const LIFECYCLE_RANK: Record<VendorLifecycle, number> = {
    "Assigned": 0, "Draft": 1, "Quote Submitted": 2, "PO Issued": 3,
    "Partially Received": 4, "Fully Received": 5,
    "Partially Invoiced": 6, "Fully Invoiced": 7,
    "Partially Paid": 8, "Paid": 9,
  };
  const lifecycleColor = (s: VendorLifecycle | ""): string => {
    switch (s) {
      case "Assigned": return "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300";
      case "Draft": return "bg-muted text-muted-foreground border-border";
      case "Quote Submitted": return "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300";
      case "PO Issued": return "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-900/30 dark:text-violet-300";
      case "Partially Received": return "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/20 dark:text-teal-300";
      case "Fully Received": return "bg-teal-600 text-white border-teal-700";
      case "Partially Invoiced": return "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300";
      case "Fully Invoiced": return "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300";
      case "Partially Paid": return "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300";
      case "Paid": return "bg-emerald-600 text-white border-emerald-700";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  const vendorLifecycleMap = useMemo(() => {
    const m: Record<string, VendorLifecycle> = {};
    const finalized = new Set(finalizedVendorIds);
    summaryVendorIds.forEach((vid) => {
      const q = vendorQuotes.find((qq) => qq.vendor_id === vid);
      const vGrns = grns.filter((g) => g.vendor_id === vid);
      const vInvs = invoices.filter((i) => i.vendor_id === vid);
      const invIds = new Set(vInvs.map((i) => i.id));
      const vPays = invPayments.filter((p) => invIds.has(p.invoice_id));
      const assigned = vendorAssignments.find((r) => r.vendor_id === vid);
      const scopedLineIds = assigned
        ? new Set(assigned.line_ids)
        : new Set(rateLines.filter((l) => (l.vendor_ids || []).includes(vid)).map((l) => l.id));
      const lineAmount = rateLines
        .filter((l) => scopedLineIds.has(l.id))
        .reduce((s, l) => s + (parseFloat(l.rate) || 0) * (l.qty || 0), 0);
      const invoicedTotal = vInvs.reduce((s, i) => s + Number(i.invoice_amount || 0), 0);
      const paidTotal = vPays.reduce((s, p) => s + Number(p.amount || 0), 0);

      // Assigned = vendor row exists but no quote link generated yet.
      // Draft    = quote link generated, vendor has not submitted.
      // Quote Submitted = vendor submitted a quote.
      // PO Issued only once a submitted quote is finalized (winner picked).
      let status: VendorLifecycle = "Assigned";
      if (q) status = q.status === "submitted" ? "Quote Submitted" : "Draft";
      if (finalized.has(vid) && q?.status === "submitted") status = "PO Issued";

      if (vGrns.length > 0) {
        const anyFull = vGrns.some((g) => g.status === "Fully Received");
        status = anyFull ? "Fully Received" : "Partially Received";
      }
      // Tolerance of ₹1 to absorb rounding differences (e.g. Salesforce imports where
      // paid amount differs from invoiced by paise).
      if (invoicedTotal > 0) {
        status = invoicedTotal >= lineAmount - 1 && lineAmount > 0
          ? "Fully Invoiced"
          : "Partially Invoiced";
      }
      if (paidTotal > 0) {
        status = paidTotal >= invoicedTotal - 1 && invoicedTotal > 0
          ? "Paid"
          : "Partially Paid";
      }
      m[vid] = status;
    });
    return m;
  }, [summaryVendorIds, finalizedVendorIds, vendorQuotes, grns, invoices, invPayments, vendorAssignments, rateLines]);


  // items assigned to a given vendor (used to scope GRN/Invoice forms per vendor)
  const scopedItemVendorMap = useMemo(() => {
    if (!scopedVendorId) return itemVendorMap;
    const m: Record<string, string[]> = {};
    Object.entries(itemVendorMap).forEach(([itemId, vids]) => {
      if (vids.includes(scopedVendorId)) m[itemId] = [scopedVendorId];
    });
    return m;
  }, [scopedVendorId, itemVendorMap]);

  // Manual override for a vendor's quote status (upsert quote row if missing).
  // Handles Draft/Submitted/Reopened workflow with audit-trail timestamps.
  // "Reopened" creates a NEW version so the previously submitted quote is
  // preserved as a read-only historical record.
  const setVendorQuoteStatus = async (row: { vendor_id: string; line_ids: string[] }, status: string) => {
    if (!row.vendor_id) { toast.error("Pick a vendor first."); return; }
    try {
      const nowIso = new Date().toISOString();
      const existing = vendorQuotes.find((q) => q.vendor_id === row.vendor_id);

      // ---------- REOPEN → create a new version ----------
      if (status === "reopened" && existing) {
        const { data: { user } } = await supabase.auth.getUser();
        const prevItems = existing.procurement_vendor_quote_items || [];
        const oldToken = existing.token;
        const nextVersion = (existing.version || 1) + 1;
        const scratchToken = crypto.randomUUID().replace(/-/g, "") + "-v" + (existing.version || 1);

        // 1. Release the token from the old row + mark it archived.
        const { error: archErr } = await supabase
          .from("procurement_vendor_quotes")
          .update({ is_latest: false, token: scratchToken })
          .eq("id", existing.id);
        if (archErr) throw archErr;

        // 2. Insert the new (v+1) row inheriting the stable vendor-facing token
        //    so the previously shared link continues to work.
        const insertRow: Record<string, any> = {
          po_id: order.id,
          vendor_id: existing.vendor_id,
          token: oldToken,
          status: "reopened",
          version: nextVersion,
          is_latest: true,
          procurement_item_ids: existing.procurement_item_ids || row.line_ids,
          vendor_payment_term: existing.vendor_payment_term,
          notes: existing.notes,
          attachments: existing.attachments || [],
          term_responses: existing.term_responses || [],
          first_submitted_at: existing.first_submitted_at || null,
          last_resubmitted_at: existing.last_resubmitted_at || null,
          reopened_at: nowIso,
          reopened_by: user?.id ?? null,
          created_by: user?.id ?? null,
        };
        const { data: newQuote, error: insErr } = await supabase
          .from("procurement_vendor_quotes")
          .insert(insertRow as any)
          .select("id")
          .single();
        if (insErr) throw insErr;

        // 3. Clone prior line-item rates so the vendor edits a pre-filled draft.
        if (newQuote?.id && prevItems.length) {
          const clones = prevItems.map((it) => ({
            quote_id: newQuote.id,
            procurement_item_id: it.procurement_item_id,
            rate: it.rate,
            discount_pct: it.discount_pct,
            rate_after_discount: it.rate_after_discount,
            delivery_commitment_date: it.delivery_commitment_date,
            is_selected: it.is_selected,
            quality_notes: (it as any).quality_notes ?? null,
          }));
          const { error: cloneErr } = await supabase
            .from("procurement_vendor_quote_items")
            .insert(clones);
          if (cloneErr) throw cloneErr;
        }

        await loadVendorQuotes();
        toast.success(`Quote reopened as V${nextVersion}. Previous version preserved.`);
        return;
      }

      // ---------- All other status changes on the latest row ----------
      if (existing) {
        const patch: Record<string, any> = { status };
        if (status === "submitted") {
          patch.submitted_at = nowIso;
          if (!(existing as any).first_submitted_at) {
            patch.first_submitted_at = nowIso;
          } else {
            patch.last_resubmitted_at = nowIso;
          }
        }
        const { error } = await supabase.from("procurement_vendor_quotes")
          .update(patch)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const insertRow: Record<string, any> = {
          po_id: order.id,
          vendor_id: row.vendor_id,
          token: crypto.randomUUID().replace(/-/g, ""),
          procurement_item_ids: row.line_ids,
          status,
          version: 1,
          is_latest: true,
          created_by: user?.id ?? null,
        };
        if (status === "submitted") {
          insertRow.submitted_at = nowIso;
          insertRow.first_submitted_at = nowIso;
        }
        const { error } = await supabase.from("procurement_vendor_quotes").insert(insertRow as any);
        if (error) throw error;
      }
      await loadVendorQuotes();
      toast.success("Status updated");
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    }
  };



  // Persist just the Expected Delivery Date on its own (used on blur / auto-fill)
  // so the value never gets lost if the user forgets to hit "Save PO Details".
  const persistDeliveryDate = useCallback(async (value: string | null) => {
    const normalized = value && value.trim() ? value : null;
    if ((order.expected_delivery_date || null) === normalized) return;
    try {
      const { error } = await supabase.from("procurement_orders")
        .update({ expected_delivery_date: normalized })
        .eq("id", order.id);
      if (error) throw error;
      lastServerPoRef.current = { ...lastServerPoRef.current, expected_delivery_date: normalized || "" };
      onChanged();
    } catch (err: any) {
      toast.error(err.message || "Failed to save delivery date");
    }
  }, [order.id, order.expected_delivery_date, onChanged]);

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
    const [g, inv, docs] = await Promise.all([
      supabase.from("procurement_grns").select("*, procurement_grn_items(*)").eq("po_id", order.id).order("created_at"),
      supabase.from("procurement_invoices").select("*, procurement_invoice_items(*), procurement_invoice_payments(*), procurement_invoice_attachments(*)").eq("po_id", order.id).order("created_at"),
      supabase.from("procurement_attachments").select("id, vendor_id, file_name, file_path, file_size, version, notes, created_at, created_by").eq("po_id", order.id).eq("scope", "po_document").order("created_at", { ascending: false }),
    ]);
    const gRows = (g.data || []) as any[];
    setGrns(gRows.map((r) => ({ id: r.id, grn_number: r.grn_number, receipt_date: r.receipt_date, status: r.status, received_by: r.received_by, remarks: r.remarks, vendor_id: r.vendor_id ?? null, photos: r.photos ?? null })));
    setGrnItems(gRows.flatMap((r) => (r.procurement_grn_items || []) as GrnItemRow[]));
    const iRows = (inv.data || []) as any[];
    setInvoices(iRows.map((r) => ({ id: r.id, invoice_number: r.invoice_number, invoice_date: r.invoice_date, invoice_amount: r.invoice_amount, vendor_id: r.vendor_id ?? null })));
    setInvItems(iRows.flatMap((r) => (r.procurement_invoice_items || []) as InvItemRow[]));
    setInvPayments(iRows.flatMap((r) => (r.procurement_invoice_payments || []).map((p: any) => ({ invoice_id: r.id, amount: Number(p.amount || 0), payment_date: p.payment_date, reference_number: p.reference_number, notes: p.notes ?? null }))));
    setInvAttachments(iRows.flatMap((r) => (r.procurement_invoice_attachments || []).map((a: any) => ({ id: a.id, invoice_id: r.id, file_name: a.file_name, file_path: a.file_path, file_size: a.file_size ?? null }))));
    setPoDocs((docs.data || []) as any[]);
  }, [order.id]);

  useEffect(() => { if (open) fetchSub(); }, [open, fetchSub]);

  // Load company profile once per open for PO branding
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("company_profile").select("*").limit(1).maybeSingle();
      if (!cancelled) setCompanyProfile(data || null);
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Purchase Order document helpers
  const openPoAttachment = useCallback(async (att: { file_path: string; file_name: string }) => {
    const { data, error } = await supabase.storage.from("procurement-attachments").createSignedUrl(att.file_path, 3600);
    if (error || !data?.signedUrl) { toast.error("Could not open document"); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }, []);

  const downloadPoAttachment = useCallback(async (att: { file_path: string; file_name: string }) => {
    const { data, error } = await supabase.storage.from("procurement-attachments").download(att.file_path);
    if (error || !data) { toast.error("Could not download document"); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url; a.download = att.file_name; document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }, []);

  const generatePoForVendor = useCallback(async (params: {
    vendorId: string;
    scopedLines: RateLine[];
    quote?: VendorQuoteRow | null;
  }) => {
    const { vendorId, scopedLines, quote } = params;
    if (!vendorId) { toast.error("No vendor selected"); return; }
    if (!scopedLines.length) { toast.error("No line items assigned to this vendor"); return; }
    setPoDocBusy(vendorId);
    try {
      // Fetch full vendor record for contact + address + gst
      const { data: v } = await supabase
        .from("vendors")
        .select("name, address, gst_number, phone, email, contact_person")
        .eq("id", vendorId)
        .maybeSingle();

      const flatten = (val: any): string | null => {
        if (val == null) return null;
        if (typeof val === "string") return val;
        if (Array.isArray(val)) return val.filter(Boolean).map(String).join(", ") || null;
        if (typeof val === "object") {
          const arr = Object.values(val).filter(Boolean).map(String);
          return arr.length ? arr.join(", ") : null;
        }
        return String(val);
      };

      // Build line items using quote rate first, else procurement_items rate
      const items = scopedLines.map((l) => {
        const qi = quote?.procurement_vendor_quote_items?.find((x) => x.procurement_item_id === l.id);
        const rateAfter = qi ? Number((qi as any).rate_after_discount) : NaN;
        const rateBefore = qi ? Number(qi.rate) : NaN;
        const rate = Number.isFinite(rateAfter) && rateAfter > 0
          ? rateAfter
          : Number.isFinite(rateBefore) && rateBefore > 0
            ? rateBefore
            : Number((l as any).rate || 0);
        const discountAmt =
          qi && Number.isFinite(rateBefore) && rateBefore > 0 && Number.isFinite(rateAfter)
            ? Math.max(0, (rateBefore - rateAfter) * Number(l.qty || 0))
            : 0;
        return {
          product_name: productName(l.product_id) || "-",
          description: null,
          qty: Number(l.qty || 0),
          uom: (l as any).uom || null,
          rate,
          discount: discountAmt,
        };
      });

      const nextVersion = (poDocs.filter((d) => d.vendor_id === vendorId).reduce((m, d) => Math.max(m, Number(d.version || 0)), 0)) + 1;

      const doc = await buildPurchaseOrderPdf({
        order: {
          po_number: order.po_number,
          order_date: order.order_date,
          expected_delivery_date: order.expected_delivery_date,
          payment_terms: order.payment_terms || (quote as any)?.payment_terms || null,
          bill_to: order.bill_to,
          ship_to: order.ship_to,
          requisition_number: (order as any).requisition_number || null,
          requisition_name: reqName,
          site_name: siteName(order.site_id) || null,
          version: nextVersion,
        },
        vendor: {
          name: v?.name || vendorName(vendorId),
          contact_person: flatten(v?.contact_person),
          phone: flatten(v?.phone),
          email: flatten(v?.email),
          address: v?.address || null,
          gst_number: v?.gst_number || null,
        },
        company: {
          company_name: companyProfile?.company_name || "Bharat Builders",
          address: companyProfile?.address || null,
          gst_number: companyProfile?.gst_number || null,
          phone: companyProfile?.phone || null,
          email: companyProfile?.email || null,
          logo_url: companyProfile?.logo_url || null,
        },
        items,
      });

      const blob = doc.output("blob");
      const safeVendor = (v?.name || vendorName(vendorId) || "vendor").replace(/[^a-zA-Z0-9-_]/g, "_");
      const safePo = (order.po_number || "PO").replace(/[^a-zA-Z0-9-_]/g, "_");
      const fileName = `PO-${safePo}-${safeVendor}-v${nextVersion}.pdf`;
      const filePath = `${order.id}/po-documents/${vendorId}/${Date.now()}-v${nextVersion}.pdf`;

      const { error: upErr } = await supabase.storage
        .from("procurement-attachments")
        .upload(filePath, blob, { contentType: "application/pdf", upsert: false });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from("procurement_attachments").insert({
        po_id: order.id,
        vendor_id: vendorId,
        scope: "po_document",
        file_name: fileName,
        file_path: filePath,
        file_size: blob.size,
        content_type: "application/pdf",
        version: nextVersion,
        source: "generated",
        created_by: currentUserId || null,
      });
      if (insErr) throw insErr;

      // Auto-advance to PO Issued if still pre-issue
      const preIssue: string[] = ["Requisition", "Requisition Approved", "Quote Requested", "Quote Received"];
      if (preIssue.includes(order.status)) {
        try { await changeStatus("PO Issued" as ProcStatus, true); } catch { /* non-fatal */ }
      }

      toast.success(`Purchase Order v${nextVersion} generated`);
      await fetchSub();
      onChanged();
    } catch (err: any) {
      console.error("PO generation failed:", err);
      toast.error(err?.message || "Failed to generate PO");
    } finally {
      setPoDocBusy(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, order.po_number, order.order_date, order.expected_delivery_date, order.payment_terms, order.bill_to, order.ship_to, order.site_id, order.status, poDocs, companyProfile, currentUserId, productName, vendorName, siteName, fetchSub, onChanged]);


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
  // Per-vendor GRN/Invoice must remain available even after the overall PO status has
  // advanced (e.g. one vendor fully paid while others still need receipt/billing).
  const canReceive = isTransfer
    ? canApprove && ["Requisition Approved", "Goods Received"].includes(order.status)
    : canApprove && ["PO Issued", "Partially Received", "Goods Received", "Partially Invoiced", "Invoice Received", "Partially Paid", "Paid"].includes(order.status);
  const canInvoice =
    !isTransfer && canApprove && ["PO Issued", "Partially Received", "Goods Received", "Partially Invoiced", "Invoice Received", "Partially Paid", "Paid"].includes(order.status);

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

  const changeStatus = async (
    to: ProcStatus,
    closeAfter = false,
    opts?: { note?: string; actorName?: string; auto?: boolean },
  ) => {
    setBusy(true);
    const entry: StageHistoryEntry = {
      status: to,
      moved_by: currentUserId ?? null,
      moved_by_name: opts?.actorName || (opts?.auto ? "System" : moverName),
      moved_at: new Date().toISOString(),
      note: opts?.note ?? null,
      auto: !!opts?.auto,
    };
    const nextHistory = [...stageHistory, entry];
    const { error } = await supabase.from("procurement_orders")
      .update({ status: to, stage_history: nextHistory as any }).eq("id", order.id);
    setBusy(false);
    if (error) { toast.error(error.message || "Failed to update status"); return; }
    if (!opts?.auto) toast.success(`Status changed to ${to}`);
    onChanged();
    if (closeAfter) onOpenChange(false);
  };

  const applyTransition = (to: ProcStatus) => changeStatus(to);

  // ---- Automatic stage progression -----------------------------------------
  // Any state that satisfies a later stage's condition auto-advances the PO,
  // regardless of whether the trigger was a vendor submission or a manual edit.
  // Requisition -> Requisition Approved is intentionally excluded (manual approval).
  // Closed is never auto-set.
  const autoAdvancingRef = useRef(false);
  // When an admin manually reverts, remember the target stage so the auto-advance
  // effect doesn't immediately snap the PO back forward on the next refetch.
  // Cleared once the status moves away from the reverted-to stage.
  const revertGuardRef = useRef<ProcStatus | null>(null);
  const computeAutoTarget = useCallback((): { target: ProcStatus; note: string; actorName?: string } | null => {
    if (isTransfer) return null;
    const curIdx = STATUS_FLOW.indexOf(order.status as ProcStatus);
    if (curIdx < 0) return null;
    // Do not touch the initial approval step, and never auto-close.
    if (order.status === "Requisition" || order.status === "Closed" || order.status === "Rejected") return null;

    const hasAssignedVendors = vendorAssignments.some((r) => r.vendor_id);
    const hasQuoteLinks = vendorQuotes.length > 0;
    // Use persisted line rates (from the DB) — not unsaved local edits — so we don't
    // auto-advance on transient typing that hasn't been saved yet.
    const persistedItems = order.procurement_items || [];
    const lineHasRate = persistedItems.some((it) => Number(it.rate || 0) > 0);
    const allLinesHaveRate = persistedItems.length > 0 && persistedItems.every((it) => Number(it.rate || 0) > 0);
    const anyFullyReceived = grns.some((g) => g.status === "Fully Received");
    const hasInvoice = invoices.length > 0;

    // ---- Per-vendor aggregation for GRN / Invoice / Payment stages -----
    // These stages only advance when ALL finalized vendors have reached the
    // corresponding lifecycle rank. If vendors are in mixed states, surface
    // a "Partially ..." rollup instead of the fully-completed stage.
    const finalizedVids = finalizedVendorIds;
    const lifecycles = finalizedVids.map((vid) => vendorLifecycleMap[vid] || "PO Issued");
    const hasAnyLifecycle = lifecycles.length > 0;
    const rankOf = (s: VendorLifecycle) => LIFECYCLE_RANK[s];
    const minRank = hasAnyLifecycle ? Math.min(...lifecycles.map(rankOf)) : -1;
    const anyRank = (min: number) => hasAnyLifecycle && lifecycles.some((s) => rankOf(s) >= min);
    const allRank = (min: number) => hasAnyLifecycle && lifecycles.every((s) => rankOf(s) >= min);

    type Cand = { stage: ProcStatus; note: string; actorName?: string };
    const cands: Cand[] = [];
    if (hasAssignedVendors && hasQuoteLinks) {
      cands.push({ stage: "Quote Requested", note: "Quote link generated" });
    }
    if (lineHasRate) {
      const sourced = persistedItems.find((it) => it.rate_source === "quote" && it.rate_source_vendor_id && Number(it.rate || 0) > 0);
      if (sourced && sourced.rate_source_vendor_id) {
        const vname = vendorName(sourced.rate_source_vendor_id) || "Vendor";
        cands.push({ stage: "Quote Received", note: `${vname} submitted a quote`, actorName: vname });
      } else {
        cands.push({ stage: "Quote Received", note: "Rate entered manually" });
      }
    }
    if (allLinesHaveRate && hasAssignedVendors) {
      cands.push({ stage: "PO Issued", note: "All line rates finalized" });
    }
    // GRN aggregation — header only advances when ALL finalized vendors are fully received.
    if (allRank(LIFECYCLE_RANK["Fully Received"])) {
      cands.push({ stage: "Goods Received", note: "All vendors fully received" });
    } else if (anyFullyReceived && !hasAnyLifecycle) {
      cands.push({ stage: "Goods Received", note: "GRN marked Fully Received" });
    }
    // Invoice aggregation — header only advances when ALL finalized vendors are fully invoiced.
    if (allRank(LIFECYCLE_RANK["Fully Invoiced"])) {
      cands.push({ stage: "Invoice Received", note: "All vendors fully invoiced" });
    } else if (hasInvoice && !hasAnyLifecycle) {
      cands.push({ stage: "Invoice Received", note: "Invoice recorded" });
    }
    // Payment aggregation — header only advances when ALL finalized vendors are fully paid.
    if (allRank(LIFECYCLE_RANK["Paid"])) {
      cands.push({ stage: "Paid", note: "All vendor invoices paid in full" });
    }


    // Extended flow that includes partial rollups. Higher index = further along.
    const EXT_FLOW: string[] = [
      "Requisition", "Requisition Approved", "Quote Requested", "Quote Received",
      "PO Issued",
      "Partially Received", "Goods Received",
      "Partially Invoiced", "Invoice Received",
      "Partially Paid", "Paid",
      "Closed",
    ];
    const curExtIdx = EXT_FLOW.indexOf(order.status);
    // Pick the furthest satisfied stage that differs from current.
    let best: Cand | null = null;
    let bestIdx = curExtIdx < 0 ? curIdx : curExtIdx;
    for (const c of cands) {
      const idx = EXT_FLOW.indexOf(c.stage);
      if (idx > bestIdx) { best = c; bestIdx = idx; }
    }
    if (!best) return null;
    return { target: best.stage, note: best.note, actorName: best.actorName };
  }, [isTransfer, order.status, order.procurement_items, vendorAssignments, vendorQuotes, grns, invoices, invPayments, vendorName, finalizedVendorIds, vendorLifecycleMap]);

  useEffect(() => {
    if (!open) return;
    if (autoAdvancingRef.current || busy) return;
    // Clear the revert guard once the user moves off the reverted-to stage.
    if (revertGuardRef.current && order.status !== revertGuardRef.current) {
      revertGuardRef.current = null;
    }
    // Suppress auto-advance while sitting on a manually-reverted stage.
    if (revertGuardRef.current && order.status === revertGuardRef.current) return;
    const next = computeAutoTarget();
    if (!next) return;
    autoAdvancingRef.current = true;
    changeStatus(next.target, false, { note: next.note, actorName: next.actorName, auto: true })
      .finally(() => { autoAdvancingRef.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, computeAutoTarget]);


  const stepFlow = statusFlowFor(order.source_type);
  // Map partial rollup statuses to their nearest flow parent so the stepper still highlights.
  const stepperStatus: ProcStatus = (
    order.status === "Partially Received" ? "PO Issued" :
    order.status === "Partially Invoiced" ? "Goods Received" :
    order.status === "Partially Paid" ? "Invoice Received" :
    order.status
  ) as ProcStatus;
  const stepIndex = stepFlow.indexOf(stepperStatus);
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
    line("Requisition Date", order.order_date || "-");
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

  // ---- Vendor quote portal (per line item) ----
  // Loads ALL versions for the PO. `vendorQuotes` below exposes only the latest
  // per vendor (drives the active workflow), while `vendorQuoteHistoryByVendor`
  // exposes every version (drives the Quote History audit view).
  const loadVendorQuotes = useCallback(async () => {
    const { data } = await supabase
      .from("procurement_vendor_quotes")
      .select("id, vendor_id, token, status, version, is_latest, vendor_payment_term, notes, submitted_at, first_submitted_at, last_resubmitted_at, reopened_at, procurement_item_ids, change_request_notes, attachments, term_responses, procurement_vendor_quote_items(*)")
      .eq("po_id", order.id)
      .order("version", { ascending: false });
    setAllVendorQuotes((data || []) as unknown as VendorQuoteRow[]);
  }, [order.id]);

  useEffect(() => { if (open) loadVendorQuotes(); }, [open, loadVendorQuotes]);

  // Automatic status refresh: pick up vendor submissions without a page reload.
  // Also refresh the parent order (status + line rates) so the header stepper
  // and auto-advance logic see the server-side changes made by the vendor
  // portal edge function (e.g. Quote Requested -> Quote Received).
  useEffect(() => {
    if (!open) return;
    // Refresh only when the tab regains focus — a background interval caused
    // the Vendor Comparison row (and its "Selected" badge) to visibly flicker
    // every 30s as the parent order was re-fetched and state re-initialised.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        loadVendorQuotes();
        onChanged();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [open, loadVendorQuotes, onChanged]);

  // Auto-apply the rate when a line item has exactly ONE submitted quote and
  // the buyer hasn't already picked/adjusted a rate. Manual "Select" is only
  // required when 2+ vendors have submitted competing quotes for the same line.
  useEffect(() => {
    if (!open || vendorQuotes.length === 0 || rateLines.length === 0) return;
    const persistUpdates: { id: string; rate: number; vendor_id: string; vendor_ids: string[] }[] = [];
    setRateLines((prev) => {
      let changed = false;
      const next = prev.map((l) => {
        // Skip if buyer has already made an explicit choice/edit.
        if (l.rate_source === "quote" || l.rate_source === "manual_adjusted") return l;
        if (Number(l.rate) > 0) return l;
        const submitted = vendorQuotes.filter(
          (q) => q.status === "submitted" &&
                 (q.procurement_vendor_quote_items || []).some(
                   (x) => x.procurement_item_id === l.id && (x.rate_after_discount ?? x.rate) != null,
                 ),
        );
        if (submitted.length !== 1) return l;
        const q = submitted[0];
        const qi = (q.procurement_vendor_quote_items || []).find((x) => x.procurement_item_id === l.id)!;
        const rate = Number(qi.rate_after_discount ?? qi.rate) || 0;
        if (rate <= 0 || !q.vendor_id) return l;
        changed = true;
        const nextVendorIds = !l.vendor_ids.includes(q.vendor_id)
          ? [...l.vendor_ids, q.vendor_id]
          : l.vendor_ids;
        persistUpdates.push({ id: l.id, rate, vendor_id: q.vendor_id, vendor_ids: nextVendorIds });
        return {
          ...l,
          rate: String(rate),
          rate_source: "quote",
          rate_source_vendor_id: q.vendor_id,
          vendor_ids: nextVendorIds,
        };
      });
      return changed ? next : prev;
    });
    // Persist so the auto-applied selection survives the next server refresh
    // (prevents "Selected" badge flicker when onChanged reloads the order).
    if (persistUpdates.length) {
      void Promise.all(
        persistUpdates.map((u) =>
          supabase.from("procurement_items")
            .update({
              rate: u.rate,
              rate_source: "quote",
              rate_source_vendor_id: u.vendor_id,
              vendor_ids: u.vendor_ids,
            })
            .eq("id", u.id),
        ),
      ).catch(() => {});
    }
  }, [open, vendorQuotes, rateLines.length]);

  const quoteUrl = (token: string) => `${window.location.origin}/vendor-quote/${token}`;

  // Invite the vendors selected on a single line item to quote on that item.
  const inviteLineToQuote = async (lineId: string) => {
    const line = rateLines.find((l) => l.id === lineId);
    if (!line || line.vendor_ids.length === 0) { toast.error("Select at least one vendor for this line item."); return; }
    setGenLinks(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const existing = quotesForItem(lineId);
      const newVendorIds = line.vendor_ids.filter(
        (vid) => !existing.some((q) => q.vendor_id === vid)
      );
      if (newVendorIds.length === 0) { toast.message("Quote links already exist for all selected vendors."); return; }
      const { error } = await supabase.from("procurement_vendor_quotes").insert(
        newVendorIds.map((vid) => ({
          po_id: order.id,
          vendor_id: vid,
          token: crypto.randomUUID().replace(/-/g, ""),
          procurement_item_ids: [lineId],
          created_by: user?.id ?? null,
        }))
      );
      if (error) throw error;
      await loadVendorQuotes();
      toast.success("Quote links generated. Share them with vendors below.");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate quote links");
    } finally {
      setGenLinks(false);
    }
  };


  // Invite a single vendor to quote on a chosen set of line items (used by the Assign Vendors table).
  const inviteVendorToQuote = async (vendorId: string, itemIds: string[]) => {
    if (!vendorId || itemIds.length === 0) { toast.error("Pick a vendor and at least one line item."); return; }
    if (vendorQuotes.some((q) => q.vendor_id === vendorId)) { toast.message("A quote link already exists for this vendor."); return; }
    setGenLinks(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("procurement_vendor_quotes").insert({
        po_id: order.id,
        vendor_id: vendorId,
        token: crypto.randomUUID().replace(/-/g, ""),
        procurement_item_ids: itemIds,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      await loadVendorQuotes();
      toast.success("Quote link generated.");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate quote link");
    } finally {
      setGenLinks(false);
    }
  };

  // Quotes scoped to a given line item
  const quotesForItem = useCallback(
    (itemId: string) => vendorQuotes.filter((q) => Array.isArray(q.procurement_item_ids) && q.procurement_item_ids.includes(itemId)),
    [vendorQuotes]
  );

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

  // Apply a single vendor's quoted rate to one line item, tagging its source.
  const applyLineQuote = (lineId: string, quote: VendorQuoteRow) => {
    const qi = (quote.procurement_vendor_quote_items || []).find((x) => x.procurement_item_id === lineId);
    if (!qi) { toast.error("This vendor did not quote this item."); return; }
    const rate = Number(qi.rate_after_discount ?? qi.rate) || 0;
    setRateLines((prev) => prev.map((l) => l.id === lineId ? {
      ...l,
      rate: String(rate),
      rate_source: "quote",
      rate_source_vendor_id: quote.vendor_id,
      vendor_ids: quote.vendor_id && !l.vendor_ids.includes(quote.vendor_id)
        ? [...l.vendor_ids, quote.vendor_id]
        : l.vendor_ids,
    } : l));
    // Auto-fill expected delivery date from the vendor's commitment when empty,
    // or pull it earlier if this vendor commits sooner.
    if (qi.delivery_commitment_date) {
      setPoForm((p) => {
        if (!p.expected_delivery_date || qi.delivery_commitment_date! < p.expected_delivery_date) {
          // Persist immediately so the value survives a reload even if the
          // user never clicks "Save PO Details".
          void persistDeliveryDate(qi.delivery_commitment_date!);
          return { ...p, expected_delivery_date: qi.delivery_commitment_date! };
        }
        return p;
      });
    }
    toast.success("Rate applied. Remember to Save.");
  };

  // "Select Winner" — apply the vendor's rate to this line AND remove the losing
  // vendors' assignments for this same line, so only the chosen vendor remains.
  const selectLineWinner = (lineId: string, quote: VendorQuoteRow) => {
    if (!quote.vendor_id) return;
    const winnerVid = quote.vendor_id;
    applyLineQuote(lineId, quote);
    setVendorAssignments((prev) => {
      const next = prev
        .map((r) =>
          r.vendor_id && r.vendor_id !== winnerVid && r.line_ids.includes(lineId)
            ? { ...r, line_ids: r.line_ids.filter((x) => x !== lineId), scope: "specific" as const }
            : r,
        )
        .filter((r) => !r.vendor_id || r.line_ids.length > 0);
      syncLinesFromAssignments(next);
      return next;
    });
    setRateLines((prev) => prev.map((l) => l.id === lineId
      ? { ...l, vendor_ids: [winnerVid] }
      : l));
    toast.success("Winner selected. Save PO to persist.");
  };

  // Update a single line's rate (manual edit clears/flips the source tag).
  const setLineRate = (lineId: string, value: string) => {
    setRateLines((prev) => prev.map((l) => l.id === lineId
      ? { ...l, rate: value, rate_source: l.rate_source === "quote" ? "manual_adjusted" : l.rate_source }
      : l));
  };

  const setLineVendors = (lineId: string, ids: string[]) => {
    setRateLines((prev) => prev.map((l) => l.id === lineId ? { ...l, vendor_ids: ids } : l));
  };

  // Human-readable tag describing where a line's rate came from.
  const rateSourceLabel = (l: RateLine): string | null => {
    if (l.rate_source === "quote" && l.rate_source_vendor_id) {
      return `From ${vendorNameById[l.rate_source_vendor_id] || "vendor"}'s quote`;
    }
    if (l.rate_source === "manual_adjusted") return "Manually adjusted";
    return null;
  };







  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-w-none w-screen h-screen sm:rounded-none p-0 gap-0 flex flex-col ${lightning ? "lightning-ui" : ""}`}>
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {order.po_number || (isTransfer ? "(No TRF #)" : "(No PO #)")}
            <Badge variant="outline" className={`text-[10px] ${isTransfer ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}`}>{isTransfer ? "Internal Transfer" : "Vendor PO"}</Badge>
            <Badge variant="outline" className={`text-[10px] ${statusColor(order.status)}`}>{order.status}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4 px-6 lg:px-8 overflow-y-auto flex-1 w-full 2xl:max-w-[98vw] 2xl:mx-auto">
          {lightning && (() => {
            const resolvedSite = isTransfer
              ? [siteName(order.transfer_from_site_id), siteName(order.site_id)].filter(Boolean).join(" → ") || "—"
              : (siteName(order.site_id) || "—");
            const vendorNamesFromSummaries = (vendorSummaries || [])
              .map((v: any) => vendorName(v.vendor_id))
              .filter(Boolean);
            const resolvedVendor = isTransfer
              ? "—"
              : (vendorNamesFromSummaries.length
                  ? (vendorNamesFromSummaries.length > 2
                      ? `${vendorNamesFromSummaries.slice(0, 2).join(", ")} +${vendorNamesFromSummaries.length - 2}`
                      : vendorNamesFromSummaries.join(", "))
                  : (vendorName(order.vendor_id) || "—"));
            return (
              <>
                <HighlightsPanel
                  icon={<FileText className="h-5 w-5" />}
                  eyebrow={isTransfer ? "Internal Transfer" : "Purchase Order"}
                  title={order.po_number || (isTransfer ? "(No TRF #)" : "(No PO #)")}
                  subtitle={(order as any).requisition_name || resolvedVendor || resolvedSite}
                  fields={[
                    { label: "Status", value: order.status },
                    { label: "Requisition #", value: (order as any).requisition_number || "—" },
                    { label: "Site", value: resolvedSite },
                    { label: "Vendor", value: resolvedVendor },
                    { label: "Order Date", value: order.order_date ? new Date(order.order_date).toLocaleDateString("en-GB") : "—" },
                    { label: "Amount", value: fmtAmt(Number((order as any).total_amount || 0)) },
                    { label: "Payment Terms", value: (order as any).payment_terms || "—" },
                  ]}
                />
                <PathBar steps={stepFlow} currentIndex={stepIndex} />
              </>
            );
          })()}
          {/* Stepper + stage controls */}
          {order.status !== "Rejected" && (
            <div className="space-y-3">
              {!lightning && (
                <>
                  {/* Mobile: vertical timeline */}
                  <ol className="sm:hidden space-y-2 border-l pl-3">
                    {stepFlow.map((s, i) => {
                      const h = historyByStatus[s];
                      const when = h?.moved_at ? new Date(h.moved_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;
                      const active = i <= stepIndex;
                      return (
                        <li key={s} className="relative">
                          <span className={`absolute -left-[17px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-background ${active ? "bg-primary" : "bg-muted-foreground/30"}`} />
                          <div className="flex flex-wrap items-center gap-2">
                            <StageLabel className={`inline-flex h-5 rounded-full ${active ? statusColor(s) : "bg-muted text-muted-foreground"}`}>{s}</StageLabel>
                            {active && h && (
                              <span className="text-[10px] text-muted-foreground">
                                {h.moved_by_name || "—"}{when ? `, ${when}` : ""}
                              </span>
                            )}
                          </div>
                          {active && h?.note && (
                            <div className="text-[10px] text-muted-foreground italic mt-0.5">{h.note}</div>
                          )}
                        </li>
                      );
                    })}
                  </ol>

                  {/* Desktop: horizontal chips */}
                  <div className="hidden sm:flex items-start gap-1 pb-1 overflow-x-auto">
                    {stepFlow.map((s, i) => {
                      const h = historyByStatus[s];
                      const when = h?.moved_at ? new Date(h.moved_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;
                      return (
                        <div key={s} className="flex items-start shrink-0">
                          <div className="flex flex-col items-center gap-1 min-w-[140px] px-1">
                            <StageLabel className={`inline-flex h-5 rounded-full ${i <= stepIndex ? statusColor(s) : "bg-muted text-muted-foreground"}`}>{s}</StageLabel>
                            {i <= stepIndex && h && (
                              <span className="text-[9px] text-muted-foreground text-center leading-tight">
                                {h.moved_by_name || "—"}{when ? `, ${when}` : ""}
                                {h.note ? <><br/><span className="italic">{h.note}</span></> : null}
                              </span>
                            )}
                          </div>
                          {i < stepFlow.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground mt-1.5 shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <div className="flex items-center gap-3 flex-wrap">
                {nextStage && (
                  <Button
                    className="gap-1.5 w-full sm:w-auto"
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

          {/* Stage History — collapsible audit trail */}
          <Card>
            <button
              type="button"
              onClick={() => setStageHistoryOpen((v) => !v)}
              className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/40 transition-colors rounded-lg"
              aria-expanded={stageHistoryOpen}
            >
              <div className="flex items-center gap-2">
                {stageHistoryOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <span className="text-sm font-semibold">Stage History</span>
                <span className="text-[11px] text-muted-foreground">({stageHistory.length})</span>
              </div>
              <span className="text-[11px] text-muted-foreground">{stageHistoryOpen ? "Hide" : "View"}</span>
            </button>
            {stageHistoryOpen && (
              <CardContent className="p-3 pt-0 animate-accordion-down">
                {stageHistory.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic py-2">No stage transitions recorded yet.</div>
                ) : (
                  <ol className="space-y-2">
                    {[...stageHistory]
                      .sort((a, b) => new Date(a.moved_at).getTime() - new Date(b.moved_at).getTime())
                      .map((h, idx) => {
                        const dt = h.moved_at ? new Date(h.moved_at) : null;
                        const when = dt && !isNaN(dt.getTime())
                          ? dt.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                          : "—";
                        return (
                          <li key={idx} className="flex flex-wrap items-start gap-2 text-xs border-b last:border-b-0 pb-2 last:pb-0">
                            <Badge variant="outline" className={`text-[10px] ${statusColor(h.status)}`}>{h.status}</Badge>
                            <span className="text-foreground font-medium">{h.moved_by_name || "—"}</span>
                            {h.auto && (
                              <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">System</span>
                            )}
                            <span className="text-muted-foreground ml-auto">{when}</span>
                            {h.note && (
                              <div className="w-full text-[11px] text-muted-foreground italic pl-1">"{h.note}"</div>
                            )}
                          </li>
                        );
                      })}
                  </ol>
                )}
              </CardContent>
            )}
          </Card>

          {/* Header info */}
          <Card>
            <CardContent className="p-3 space-y-1.5 text-sm">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                Requisition Date: <span className="font-medium text-foreground">{order.order_date ? (() => { const d = new Date(order.order_date); return isNaN(d.getTime()) ? order.order_date : d.toLocaleDateString("en-GB"); })() : "-"}</span>
              </div>
              {(order as any).requisition_name && (
                <div className="text-xl font-bold leading-tight text-foreground pt-1">
                  {(order as any).requisition_name}
                </div>
              )}
              {isTransfer ? (
                <>
                  <div className="text-muted-foreground">Transfer From: <span className="font-medium text-foreground">{siteName(order.transfer_from_site_id)}</span></div>
                  <div className="text-muted-foreground">Transfer To: <span className="font-medium text-foreground">{siteName(order.site_id)}</span></div>
                  {order.po_number && <div className="text-muted-foreground">Transfer Number: <span className="font-medium text-foreground">{order.po_number}</span></div>}
                  {order.requisition_notes && <div className="text-muted-foreground">Reason: <span className="whitespace-pre-wrap">{order.requisition_notes}</span></div>}
                </>
              ) : (
                <>
                  <div className="text-muted-foreground">Site: {siteName(order.site_id)}</div>
                  {order.po_number && <div className="text-muted-foreground">PO Number: <span className="font-medium text-foreground">{order.po_number}</span></div>}
                  {(order.bill_to || order.ship_to) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t mt-2">
                      <div className="text-muted-foreground">
                        <div className="text-xs font-semibold text-foreground mb-1">Bill To</div>
                        {order.bill_to ? (
                          <>
                            <span className="whitespace-pre-wrap">{order.bill_to}</span>
                            {order.bill_to_gst && <span className="block">GST: {order.bill_to_gst}</span>}
                          </>
                        ) : <span className="italic">—</span>}
                      </div>
                      <div className="text-muted-foreground">
                        <div className="text-xs font-semibold text-foreground mb-1">Ship To</div>
                        {order.ship_to ? (
                          <>
                            <span className="whitespace-pre-wrap">{order.ship_to}</span>
                            {order.ship_to_gst && <span className="block">GST: {order.ship_to_gst}</span>}
                          </>
                        ) : <span className="italic">—</span>}
                      </div>
                    </div>
                  )}
                  {order.requisition_notes && <div className="text-muted-foreground">Reason: <span className="whitespace-pre-wrap">{order.requisition_notes}</span></div>}

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t mt-2">
                    <div>
                      <Label className="text-xs">Expected Delivery Date</Label>
                      <Input
                        type="date" className="h-9"
                        value={poForm.expected_delivery_date}
                        disabled={!poUnlocked}
                        onChange={(e) => setPoForm((p) => ({ ...p, expected_delivery_date: e.target.value }))}
                        onBlur={(e) => { if (poUnlocked) void persistDeliveryDate(e.target.value); }}
                      />
                      {poForm.expected_delivery_date && (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {(() => {
                            const [y, m, d] = poForm.expected_delivery_date.split("-");
                            return d && m && y ? `${d}/${m}/${y}` : poForm.expected_delivery_date;
                          })()}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs">Payment Terms</Label>
                      <Input
                        value={poForm.payment_terms}
                        onChange={(e) => setPoForm((p) => ({ ...p, payment_terms: e.target.value }))}
                        disabled={!poUnlocked}
                        placeholder="e.g. Net 30, 50% Advance"
                        className="h-9"
                      />
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


          {/* Assign Vendors — one row per vendor (vendor POs only) */}
          {!isTransfer && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between gap-2">
                  <span>Assign Vendors</span>
                  {poUnlocked && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addAssignmentRow}>
                      <Plus className="h-3 w-3" /> Add Vendor
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {vendorAssignments.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-2">
                    No vendors assigned yet.{poUnlocked ? " Click \"Add Vendor\" to invite one." : ""}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded border">
                    <table className="w-full text-xs min-w-[640px]">
                      <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <tr className="text-left">
                          <th className="p-2 w-8"></th>
                          <th className="p-2 w-8">#</th>
                          <th className="p-2">Vendor</th>
                          <th className="p-2 w-48">Apply To</th>
                          <th className="p-2 w-36">Quote Link</th>
                          <th className="p-2 w-28">Status</th>
                          <th className="p-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {vendorAssignments.map((row, idx) => {
                          const isSpecific = row.scope === "specific";
                          const quote = vendorQuotes.find((q) => q.vendor_id === row.vendor_id);
                          const qStatus = quote?.status || "";
                          const takenVendorIds = new Set(vendorAssignments.filter((x) => x.key !== row.key && x.vendor_id).map((x) => x.vendor_id));
                          const vendorOptions = vendors.filter((v) => !takenVendorIds.has(v.id));
                          const filteredVendors = vendorPickerFor === row.key
                            ? vendorOptions.filter((v) => v.name.toLowerCase().includes(vendorSearch.toLowerCase()))
                            : vendorOptions;
                          // Product-name label for "Apply To" (instead of raw counts).
                          const scopedNames = row.line_ids
                            .map((id) => productName(rateLines.find((l) => l.id === id)?.product_id || null))
                            .filter(Boolean);
                          const applyLabel = row.line_ids.length === 0
                            ? "Pick items…"
                            : scopedNames.length === 0
                              ? `${row.line_ids.length} item${row.line_ids.length === 1 ? "" : "s"}`
                              : scopedNames.length === 1
                                ? scopedNames[0]
                                : `${scopedNames[0]} +${scopedNames.length - 1} more`;
                          const isExpanded = expandedVendorRow === row.key;
                          const finSummary = row.vendor_id ? vendorSummaries.find((v) => v.vendor_id === row.vendor_id) : null;
                          const scopedLines = rateLines.filter((l) => row.line_ids.includes(l.id));
                          const vGrns = row.vendor_id ? grns.filter((g) => g.vendor_id === row.vendor_id) : [];
                          const vInvs = row.vendor_id ? invoices.filter((i) => i.vendor_id === row.vendor_id) : [];
                          const hasGrn = vGrns.length > 0;
                          const paidTotal = finSummary?.paid_total || 0;
                          const balanceDue = finSummary?.balance_due || 0;
                          const invoicedTotal = finSummary?.invoiced_total || 0;
                          // Color-coded quote status pill
                          const qsLabel =
                            qStatus === "submitted" ? "Quote Submitted" :
                            qStatus === "changes_requested" ? "T&C Changes Requested" :
                            qStatus === "reopened" ? "Reopened" :
                            qStatus === "draft" ? "Draft" : "";
                          const qsCls =
                            qStatus === "submitted" ? "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300" :
                            qStatus === "changes_requested" ? "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300" :
                            qStatus === "reopened" ? "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300" :
                            "bg-muted text-muted-foreground border-border";
                          // Per-vendor lifecycle pill (independent of PO header status)
                          const vLifecycle = row.vendor_id ? vendorLifecycleMap[row.vendor_id] : undefined;
                          const progressPill = !isTransfer && row.vendor_id && vLifecycle
                            ? { label: vLifecycle, cls: lifecycleColor(vLifecycle) }
                            : null;
                          const fmtDT = (iso?: string | null) => iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
                           const hasFinalized = finalizedVendorIds.length > 0;
                           void hasFinalized; // vendors stay active regardless of finalization
                           return (
                             <Fragment key={row.key}>
                             <tr className="border-t align-top">
                              <td className="p-2">
                                <button
                                  type="button" className="text-muted-foreground hover:text-foreground"
                                  onClick={() => setExpandedVendorRow(isExpanded ? null : row.key)}
                                  title={isExpanded ? "Collapse" : "Expand details"}
                                >
                                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                </button>
                              </td>
                              <td className="p-2 text-muted-foreground">{idx + 1}</td>
                              <td className="p-2">
                                <Popover open={vendorPickerFor === row.key} onOpenChange={(o) => { setVendorPickerFor(o ? row.key : null); setVendorSearch(""); }}>
                                  <PopoverTrigger asChild>
                                    <Button type="button" variant="outline" className="h-8 w-full justify-between font-normal text-xs" disabled={!poUnlocked}>
                                      <span className="truncate text-left">
                                        {row.vendor_id
                                          ? vendorName(row.vendor_id)
                                          : <span className="text-muted-foreground">Select vendor…</span>}
                                      </span>
                                      <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-[--radix-popover-trigger-width] p-2" align="start">
                                    <div className="relative mb-2">
                                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                      <Input
                                        autoFocus
                                        placeholder="Search vendors…"
                                        value={vendorSearch}
                                        onChange={(e) => setVendorSearch(e.target.value)}
                                        className="h-8 pl-7 text-xs"
                                      />
                                    </div>
                                    <div className="max-h-56 overflow-y-auto">
                                      {filteredVendors.length === 0 ? (
                                        <p className="text-xs text-muted-foreground p-2">No vendors found.</p>
                                      ) : filteredVendors.map((v) => (
                                        <button
                                          key={v.id}
                                          type="button"
                                          className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-muted ${row.vendor_id === v.id ? "bg-muted font-medium" : ""}`}
                                          onClick={() => {
                                            updateAssignment(row.key, { vendor_id: v.id });
                                            setVendorPickerFor(null);
                                            setVendorSearch("");
                                          }}
                                        >
                                          {v.name}
                                        </button>
                                      ))}
                                    </div>
                                  </PopoverContent>
                                </Popover>
                                {row.vendor_id && !isTransfer && (
                                  <div className="mt-1 flex flex-wrap items-center gap-1">
                                    {progressPill && (
                                      <span className={`inline-flex items-center rounded border px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide ${progressPill.cls}`}>{progressPill.label}</span>
                                    )}
                                    {hasGrn && (
                                      <span className="inline-flex items-center rounded border bg-background px-1.5 py-0 text-[9px] text-muted-foreground"><Truck className="h-2.5 w-2.5 mr-0.5" />{vGrns.length} GRN</span>
                                    )}
                                    {vInvs.length > 0 && (
                                      <span className="inline-flex items-center rounded border bg-background px-1.5 py-0 text-[9px] text-muted-foreground"><FileText className="h-2.5 w-2.5 mr-0.5" />{vInvs.length} Inv</span>
                                    )}
                                    {paidTotal > 0 && (
                                      <span className="inline-flex items-center rounded border bg-background px-1.5 py-0 text-[9px] text-muted-foreground">{fmtAmt(paidTotal)} paid</span>
                                    )}
                                    {invoicedTotal > 0 && (
                                      <span className={`inline-flex items-center rounded border px-1.5 py-0 text-[9px] font-medium ${balanceDue > 1 ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300" : "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300"}`}>Bal {fmtAmt(balanceDue)}</span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="p-2">
                                <div className="flex items-center gap-1">
                                  <Select
                                    value={row.scope}
                                    onValueChange={(v) => {
                                      if (v === "all") {
                                        updateAssignment(row.key, { scope: "all", line_ids: rateLines.map((l) => l.id) });
                                      } else {
                                        // Preserve any current selection so the generated link stays scoped.
                                        // If nothing was selected, start empty and open the picker.
                                        updateAssignment(row.key, { scope: "specific" });
                                        setTimeout(() => setScopePickerFor(row.key), 0);
                                      }
                                    }}
                                    disabled={!poUnlocked}
                                  >
                                    <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="all">All items</SelectItem>
                                      <SelectItem value="specific">Specific…</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  {isSpecific && (
                                    <Popover open={scopePickerFor === row.key} onOpenChange={(o) => setScopePickerFor(o ? row.key : null)}>
                                      <PopoverTrigger asChild>
                                        <button type="button" className="text-[11px] text-primary hover:underline whitespace-nowrap truncate max-w-[10rem] text-left" disabled={!poUnlocked} title={applyLabel}>
                                          {applyLabel}
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent align="start" className="w-64 p-2 max-h-64 overflow-y-auto">
                                        <p className="text-[11px] font-medium mb-1.5">Line items for this vendor</p>
                                        {rateLines.map((l) => (
                                          <label key={l.id} className="flex items-start gap-2 text-xs cursor-pointer p-1 hover:bg-muted rounded">
                                            <Checkbox
                                              checked={row.line_ids.includes(l.id)}
                                              onCheckedChange={(c) => {
                                                const next = c
                                                  ? [...row.line_ids, l.id]
                                                  : row.line_ids.filter((x) => x !== l.id);
                                                updateAssignment(row.key, { line_ids: next });
                                              }}
                                            />
                                            <span className="flex-1">
                                              <span className="font-medium">{productName(l.product_id)}</span>
                                              <span className="text-muted-foreground"> · Qty {l.qty}</span>
                                            </span>
                                          </label>
                                        ))}
                                      </PopoverContent>
                                    </Popover>
                                  )}
                                </div>
                              </td>
                              <td className="p-2">
                                {quote ? (
                                  <div className="flex items-center gap-1">
                                    <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => copyLink(quote.token)} title={quoteUrl(quote.token)}>
                                      <Copy className="h-3 w-3" /> Copy
                                    </Button>
                                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" asChild title="Open link">
                                      <a href={quoteUrl(quote.token)} target="_blank" rel="noreferrer"><Link2 className="h-3 w-3" /></a>
                                    </Button>
                                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-emerald-700 dark:text-emerald-400" onClick={() => shareLinkWhatsApp(quote.vendor_id || "", quote.token)} title="Share on WhatsApp">
                                      <MessageCircle className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ) : (
                                  <Button
                                    type="button" size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                                    disabled={!poUnlocked || !row.vendor_id || row.line_ids.length === 0 || genLinks}
                                    onClick={() => inviteVendorToQuote(row.vendor_id, row.line_ids)}
                                  >
                                    <Link2 className="h-3 w-3" /> Generate
                                  </Button>
                                )}
                              </td>
                              <td className="p-2">
                                {(() => {
                                  const s = qStatus || "";
                                  const label =
                                    s === "submitted" ? "Quote Submitted" :
                                    s === "changes_requested" ? "T&C Changes Requested" :
                                    s === "reopened" ? "Reopened" :
                                    s === "draft" ? "Draft" :
                                    "—";
                                  const cls =
                                    s === "submitted" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-300" :
                                    s === "changes_requested" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-300" :
                                    s === "reopened" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-300" :
                                    s === "draft" ? "bg-muted text-muted-foreground border-border" :
                                    "bg-muted text-muted-foreground border-border";
                                  const canOverride = poUnlocked && isAdmin && !!row.vendor_id;
                                  const canReopen = poUnlocked && !!row.vendor_id && (s === "submitted" || s === "changes_requested");
                                  return (
                                    <div className="flex items-center gap-1.5">
                                      {canOverride ? (
                                        <Select
                                          value={s || undefined}
                                          onValueChange={(v) => setVendorQuoteStatus(row, v)}
                                        >
                                          <SelectTrigger className={`h-7 w-[160px] text-[11px] px-2 ${cls}`}>
                                            <SelectValue placeholder="Set status">{label}</SelectValue>
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="draft">Draft</SelectItem>
                                            <SelectItem value="submitted">Quote Submitted</SelectItem>
                                            <SelectItem value="changes_requested">T&C Changes Requested</SelectItem>
                                            <SelectItem value="reopened">Reopened</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      ) : (
                                        <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${cls}`}>
                                          {label}
                                        </span>
                                      )}
                                      {!canOverride && canReopen && (
                                        <Button
                                          type="button" size="sm" variant="outline" className="h-6 px-2 text-[10px]"
                                          onClick={() => setVendorQuoteStatus(row, "reopened")}
                                          title="Reopen this quote so the vendor can edit and resubmit"
                                        >
                                          Reopen
                                        </Button>
                                      )}
                                    </div>
                                  );
                                })()}
                              </td>


                              <td className="p-2">
                                <Button
                                  type="button" size="icon" variant="ghost"
                                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                  disabled={!poUnlocked}
                                  onClick={() => removeAssignmentRow(row.key)}
                                  title="Remove"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="border-t bg-muted/20">
                                <td></td>
                                <td colSpan={6} className="p-2">
                                  <div className="max-h-[75vh] overflow-y-auto pr-1 space-y-2">

                                    {/* Compact timeline */}
                                    {quote && (quote.first_submitted_at || quote.reopened_at || quote.last_resubmitted_at || qStatus === "changes_requested") && (
                                      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                        {quote.first_submitted_at && (
                                          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 px-1.5 py-0.5">✓ Submitted <span className="font-medium">{fmtDT(quote.first_submitted_at)}</span></span>
                                        )}
                                        {quote.reopened_at && (
                                          <span className="inline-flex items-center gap-1 rounded bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 px-1.5 py-0.5">↺ Reopened <span className="font-medium">{fmtDT(quote.reopened_at)}</span></span>
                                        )}
                                        {qStatus === "changes_requested" && (
                                          <span className="inline-flex items-center gap-1 rounded bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300 px-1.5 py-0.5">📝 T&C Changes <span className="font-medium">{fmtDT(quote.last_resubmitted_at || quote.submitted_at)}</span></span>
                                        )}
                                        {quote.last_resubmitted_at && qStatus !== "changes_requested" && (
                                          <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">⟳ Resubmitted <span className="font-medium">{fmtDT(quote.last_resubmitted_at)}</span></span>
                                        )}
                                      </div>
                                    )}

                                    {/* Workflow tabs — GRNs & Invoices are primary */}
                                    {(() => {
                                      const showVendorTabs = !isTransfer && !!row.vendor_id;
                                      const showFinancials = !isTransfer && !!finSummary;
                                      const focusedSection = focus?.vendorId && focus.vendorId === row.vendor_id ? focus.section : null;
                                      const defaultTab =
                                        focusedSection && ["quote", "grns", "invoices", "financials", "po"].includes(focusedSection)
                                          ? focusedSection
                                          : "quote";
                                      const vendorPoDocs = poDocs.filter((d) => d.vendor_id === row.vendor_id);
                                      return (
                                        <Tabs defaultValue={defaultTab} className="w-full">
                                          <TabsList className="w-full flex flex-wrap justify-start h-auto p-1 bg-muted/60 rounded-md">
                                            <TabsTrigger value="quote" className="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
                                              Quote Details
                                            </TabsTrigger>
                                            {showVendorTabs && (
                                              <TabsTrigger value="po" className="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
                                                <FileText className="h-3.5 w-3.5 mr-1.5" />Purchase Order
                                                {vendorPoDocs.length > 0 && (
                                                  <span className="ml-1 text-muted-foreground font-normal">({vendorPoDocs.length})</span>
                                                )}
                                              </TabsTrigger>
                                            )}
                                            {showVendorTabs && (
                                              <TabsTrigger value="grns" className="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
                                                <Truck className="h-3.5 w-3.5 mr-1.5" />Goods Receipts
                                                <span className="ml-1 text-muted-foreground font-normal">({vGrns.length})</span>
                                              </TabsTrigger>
                                            )}
                                            {showVendorTabs && (
                                              <TabsTrigger value="invoices" className="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
                                                <FileText className="h-3.5 w-3.5 mr-1.5" />Invoices
                                                <span className="ml-1 text-muted-foreground font-normal">({vInvs.length})</span>
                                              </TabsTrigger>
                                            )}
                                            {showFinancials && (
                                              <TabsTrigger value="financials" className="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
                                                Financial Summary
                                              </TabsTrigger>
                                            )}
                                          </TabsList>

                                          {showVendorTabs && (
                                            <TabsContent value="po" className="mt-2 border rounded-md bg-background p-2">
                                              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                                <div className="flex items-center gap-1.5 text-xs font-medium">
                                                  <FileText className="h-3.5 w-3.5" />Purchase Order Documents
                                                  {vendorPoDocs.length > 0 && (
                                                    <span className="text-muted-foreground font-normal">({vendorPoDocs.length} version{vendorPoDocs.length === 1 ? "" : "s"})</span>
                                                  )}
                                                </div>
                                                {poUnlocked && row.vendor_id && (
                                                  <Button
                                                    size="sm" variant="outline" className="h-7 text-[11px] gap-1 shrink-0"
                                                    disabled={poDocBusy === row.vendor_id || scopedLines.length === 0}
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      generatePoForVendor({ vendorId: row.vendor_id!, scopedLines, quote });
                                                    }}
                                                    title={scopedLines.length === 0 ? "Assign line items first" : (vendorPoDocs.length > 0 ? "Regenerate a new version" : "Generate the Purchase Order PDF")}
                                                  >
                                                    <FileText className="h-3 w-3" />
                                                    {poDocBusy === row.vendor_id
                                                      ? "Generating…"
                                                      : vendorPoDocs.length > 0 ? `Regenerate (v${(vendorPoDocs[0].version || 0) + 1})` : "Generate PO"}
                                                  </Button>
                                                )}
                                              </div>
                                              {vendorPoDocs.length === 0 ? (
                                                <p className="text-[11px] text-muted-foreground">
                                                  No Purchase Order generated yet. Once vendor rates are finalized, click <span className="font-medium">Generate PO</span> to create a printable, emailable PDF against this vendor.
                                                </p>
                                              ) : (
                                                <div className="border rounded divide-y">
                                                  {vendorPoDocs.map((att, idx) => {
                                                    const vRec = vendors.find((x) => x.id === row.vendor_id);
                                                    const emailStr = vRec?.email || "";
                                                    return (
                                                      <div key={att.id} className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-[11px]">
                                                        <span className="font-semibold w-8">v{att.version ?? "-"}</span>
                                                        {idx === 0 && (
                                                          <span className="inline-flex items-center rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Current</span>
                                                        )}
                                                        <span className="truncate flex-1 min-w-0" title={att.file_name}>{att.file_name}</span>
                                                        <span className="text-muted-foreground whitespace-nowrap">{fmtDT(att.created_at)}</span>
                                                        <div className="flex items-center gap-1">
                                                          <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={(e) => { e.stopPropagation(); openPoAttachment(att); }} title="Preview">
                                                            Preview
                                                          </Button>
                                                          <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={(e) => { e.stopPropagation(); downloadPoAttachment(att); }} title="Download">
                                                            <Download className="h-3 w-3" />
                                                          </Button>
                                                          <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={(e) => { e.stopPropagation(); openPoAttachment(att); }} title="Open to print">
                                                            Print
                                                          </Button>
                                                          <Button
                                                            type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px]"
                                                            onClick={async (e) => {
                                                              e.stopPropagation();
                                                              const { data } = await supabase.storage.from("procurement-attachments").createSignedUrl(att.file_path, 3600 * 24);
                                                              const link = data?.signedUrl || "";
                                                              const subj = encodeURIComponent(`Purchase Order ${order.po_number || ""} - ${vendorName(row.vendor_id!)}`);
                                                              const bodyLines = [
                                                                `Dear ${vendorName(row.vendor_id!)},`,
                                                                "",
                                                                `Please find attached Purchase Order ${order.po_number || ""} for your reference.`,
                                                                link ? `Download: ${link}` : "",
                                                                "",
                                                                `Site: ${siteName(order.site_id) || "-"}`,
                                                                order.expected_delivery_date ? `Expected Delivery: ${order.expected_delivery_date}` : "",
                                                                order.payment_terms ? `Payment Terms: ${order.payment_terms}` : "",
                                                                "",
                                                                "Regards,",
                                                                companyProfile?.company_name || "Bharat Builders",
                                                              ].filter(Boolean).join("\n");
                                                              window.location.href = `mailto:${emailStr}?subject=${subj}&body=${encodeURIComponent(bodyLines)}`;
                                                            }}
                                                            title="Email to vendor"
                                                          >
                                                            <MessageCircle className="h-3 w-3" />
                                                          </Button>
                                                        </div>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              )}
                                              <p className="mt-2 text-[10px] text-muted-foreground">
                                                Every generation creates a new version. The most recent version is marked <span className="font-medium">Current</span>. All versions are saved for audit.
                                              </p>
                                            </TabsContent>
                                          )}



                                          {showVendorTabs && (
                                            <TabsContent value="grns" className="mt-2 border rounded-md bg-background p-2">
                                              <div className="flex items-center justify-between mb-2">
                                                <span className="flex items-center gap-1.5 text-xs font-medium"><Truck className="h-3.5 w-3.5" />Goods Receipts <span className="text-muted-foreground font-normal">({vGrns.length})</span></span>
                                                {canReceive && (
                                                  <Button
                                                    size="sm" variant="outline" className="h-6 text-[11px] shrink-0"
                                                    onClick={(e) => { e.stopPropagation(); setScopedVendorId(row.vendor_id!); setGrnVendorId(row.vendor_id!); setGrnOpen(true); }}
                                                  >
                                                    <Plus className="h-3 w-3 mr-1" />Receive Goods
                                                  </Button>
                                                )}
                                              </div>
                                              {vGrns.length === 0 ? (
                                                <p className="text-[11px] text-muted-foreground">No goods received from this vendor yet.</p>
                                              ) : (
                                                <div className="border rounded divide-y max-h-40 overflow-y-auto">
                                                  {vGrns.map((g) => (
                                                    <div
                                                      key={g.id} role="button" tabIndex={0}
                                                      onClick={() => setSelectedGrn(g)}
                                                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedGrn(g); } }}
                                                      className="flex items-center justify-between px-2 py-1 text-[11px] cursor-pointer hover:bg-muted/60"
                                                    >
                                                      <div>
                                                        <div className="font-medium">{g.grn_number}</div>
                                                        <div className="text-[10px] text-muted-foreground">{g.receipt_date}{g.received_by ? ` · ${g.received_by}` : ""}</div>
                                                      </div>
                                                      <Badge variant="outline" className={`text-[10px] ${statusColor(g.status)}`}>{g.status}</Badge>
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                            </TabsContent>
                                          )}

                                          {showVendorTabs && (
                                            <TabsContent value="invoices" className="mt-2 border rounded-md bg-background p-2">
                                              <div className="flex items-center justify-between mb-2">
                                                <span className="flex items-center gap-1.5 text-xs font-medium"><FileText className="h-3.5 w-3.5" />Invoices <span className="text-muted-foreground font-normal">({vInvs.length})</span></span>
                                                {canInvoice && (
                                                  <Button
                                                    size="sm" variant="outline" className="h-6 text-[11px] shrink-0"
                                                    disabled={!hasGrn && vInvs.length === 0}
                                                    title={!hasGrn && vInvs.length === 0 ? "Receive goods first" : "Add Invoice"}
                                                    onClick={(e) => { e.stopPropagation(); if (!hasGrn && vInvs.length === 0) return; setScopedVendorId(row.vendor_id!); setInvVendorId(row.vendor_id!); setInvOpen(true); }}
                                                  >
                                                    <Plus className="h-3 w-3 mr-1" />Add Invoice
                                                  </Button>
                                                )}
                                              </div>
                                              {vInvs.length > 0 ? (
                                                <div className="border rounded divide-y max-h-40 overflow-y-auto">
                                                  {vInvs.map((i) => (
                                                    <div
                                                      key={i.id} role="button" tabIndex={0}
                                                      onClick={() => setSelectedInvoiceId(i.id)}
                                                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedInvoiceId(i.id); } }}
                                                      className="flex items-center justify-between px-2 py-1 text-[11px] cursor-pointer hover:bg-muted/60"
                                                    >
                                                      <div>
                                                        <div className="font-medium">{i.invoice_number}</div>
                                                        <div className="text-[10px] text-muted-foreground">{i.invoice_date}</div>
                                                      </div>
                                                      <div className="font-medium">{fmtAmt(i.invoice_amount)}</div>
                                                    </div>
                                                  ))}
                                                </div>
                                              ) : !hasGrn ? (
                                                <p className="text-[11px] text-muted-foreground">Receive goods first — invoices can be added after the first GRN.</p>
                                              ) : (
                                                <p className="text-[11px] text-muted-foreground">No invoices for this vendor yet.</p>
                                              )}
                                            </TabsContent>
                                          )}

                                          {showFinancials && (
                                            <TabsContent value="financials" className="mt-2 border rounded-md bg-background p-2">
                                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                                                <div><span className="text-muted-foreground">PO Value: </span><span className="font-medium">{fmtAmt(finSummary!.line_amount)}</span></div>
                                                <div><span className="text-muted-foreground">Invoiced: </span><span className="font-medium">{fmtAmt(finSummary!.invoiced_total)}</span></div>
                                                <div><span className="text-muted-foreground">Paid: </span><span className="font-medium">{fmtAmt(finSummary!.paid_total)}</span></div>
                                                <div><span className="text-muted-foreground">Outstanding: </span>
                                                  <span className={`font-semibold ${finSummary!.balance_due > 1 ? "text-red-600" : "text-green-600"}`}>{fmtAmt(finSummary!.balance_due)}</span>
                                                </div>
                                              </div>
                                              {finSummary!.payments.length > 0 && (
                                                <div className="pt-2 mt-2 border-t">
                                                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Payment Schedule</div>
                                                  <div className="max-h-32 overflow-y-auto space-y-0.5">
                                                    {finSummary!.payments.map((p, i) => (
                                                      <div key={i} className="flex items-center justify-between text-[11px]">
                                                        <span>{p.payment_date || "—"}{p.reference_number ? ` · ${p.reference_number}` : ""}</span>
                                                        <span className="font-medium">{fmtAmt(p.amount)}</span>
                                                      </div>
                                                    ))}
                                                  </div>
                                                </div>
                                              )}
                                            </TabsContent>
                                          )}

                                          <TabsContent value="quote" className="mt-2 border rounded-md bg-background p-2 space-y-2">
                                            {/* Items in scope — truncated */}
                                            <div>
                                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Assigned items</div>
                                              {scopedLines.length === 0 ? (
                                                <p className="text-[11px] text-muted-foreground">No items selected.</p>
                                              ) : scopedLines.length <= 2 ? (
                                                <div className="space-y-0.5">
                                                  {scopedLines.map((l) => {
                                                    const qi = quote?.procurement_vendor_quote_items?.find((x) => x.procurement_item_id === l.id);
                                                    const rate = qi ? Number(qi.rate_after_discount ?? qi.rate) || 0 : null;
                                                    return (
                                                      <div key={l.id} className="flex items-center gap-2 text-[11px]">
                                                        <span className="flex-1 truncate"><span className="font-medium">{productName(l.product_id)}</span> · Qty {l.qty}</span>
                                                        <span className="w-20 text-right">{rate != null ? fmtAmt(rate) : <span className="text-muted-foreground">—</span>}</span>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              ) : (
                                                <div className="text-[11px] flex items-center gap-1 flex-wrap">
                                                  <span className="font-medium">{productName(scopedLines[0].product_id)}</span>,
                                                  <span className="font-medium">{productName(scopedLines[1].product_id)}</span>
                                                  <Popover>
                                                    <PopoverTrigger asChild>
                                                      <button type="button" className="text-primary hover:underline">+{scopedLines.length - 2} more</button>
                                                    </PopoverTrigger>
                                                    <PopoverContent align="start" className="w-72 p-2 max-h-56 overflow-y-auto">
                                                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">All assigned items</div>
                                                      <div className="space-y-0.5">
                                                        {scopedLines.map((l) => {
                                                          const qi = quote?.procurement_vendor_quote_items?.find((x) => x.procurement_item_id === l.id);
                                                          const rate = qi ? Number(qi.rate_after_discount ?? qi.rate) || 0 : null;
                                                          return (
                                                            <div key={l.id} className="flex items-center gap-2 text-[11px] border-b last:border-b-0 py-1">
                                                              <span className="flex-1 truncate"><span className="font-medium">{productName(l.product_id)}</span> · Qty {l.qty}</span>
                                                              <span className="w-20 text-right">{rate != null ? fmtAmt(rate) : <span className="text-muted-foreground">—</span>}</span>
                                                            </div>
                                                          );
                                                        })}
                                                      </div>
                                                    </PopoverContent>
                                                  </Popover>
                                                </div>
                                              )}
                                            </div>

                                            {quote?.notes?.trim() && (
                                              <div>
                                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Vendor Remarks</div>
                                                <p className="text-[11px] whitespace-pre-line">{quote.notes}</p>
                                              </div>
                                            )}

                                            {quote?.attachments && quote.attachments.length > 0 && (
                                              <div>
                                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Attachments</div>
                                                <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                                                  {quote.attachments.map((a, i) => (
                                                    <li key={i} className="text-[11px]">
                                                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:opacity-80 break-all">
                                                        {a.name || `Attachment ${i + 1}`}
                                                      </a>
                                                      {typeof a.size === "number" && a.size > 0 && (
                                                        <span className="text-muted-foreground"> · {(a.size / 1024).toFixed(0)} KB</span>
                                                      )}
                                                    </li>
                                                  ))}
                                                </ul>
                                              </div>
                                            )}

                                            {/* Quote History — every submitted/reopened version */}
                                            {row.vendor_id && (vendorQuoteHistoryByVendor[row.vendor_id]?.length || 0) > 0 && (
                                              <div>
                                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Quote History</div>
                                                <div className="border rounded divide-y max-h-40 overflow-y-auto">
                                                  {vendorQuoteHistoryByVendor[row.vendor_id].map((h) => {
                                                    const sLabel =
                                                      h.status === "submitted" ? "Submitted" :
                                                      h.status === "changes_requested" ? "T&C Changes" :
                                                      h.status === "reopened" ? "Reopened (Draft)" :
                                                      h.status === "draft" ? "Draft" : h.status;
                                                    const sCls =
                                                      h.status === "submitted" ? "bg-emerald-100 text-emerald-700 border-emerald-300" :
                                                      h.status === "changes_requested" ? "bg-amber-100 text-amber-700 border-amber-300" :
                                                      h.status === "reopened" ? "bg-blue-100 text-blue-700 border-blue-300" :
                                                      "bg-muted text-muted-foreground border-border";
                                                    const when = h.submitted_at || h.last_resubmitted_at || h.reopened_at || h.first_submitted_at;
                                                    return (
                                                      <div key={h.id} className="flex items-center gap-2 px-2 py-1 text-[11px]">
                                                        <span className="font-semibold w-8">V{h.version || 1}</span>
                                                        <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${sCls}`}>{sLabel}</span>
                                                        {h.is_latest && (
                                                          <span className="inline-flex items-center rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Active</span>
                                                        )}
                                                        <span className="text-muted-foreground ml-auto">{when ? fmtDT(when) : "—"}</span>
                                                        <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setViewQuoteId(h.id)}>
                                                          View
                                                        </Button>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                                <p className="mt-1 text-[10px] text-muted-foreground">Latest version is the active quote used for PO generation. Older versions are read-only.</p>
                                              </div>
                                            )}
                                          </TabsContent>
                                        </Tabs>
                                      );
                                    })()}

                                  </div>
                                </td>
                              </tr>
                            )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Change requests surfaced under the table */}
                {vendorQuotes.filter((q) => q.status === "changes_requested").map((q) => (
                  <div key={`cr-${q.id}`} className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-2 text-[11px] space-y-1">
                    <p className="font-medium text-amber-800 dark:text-amber-300">
                      {vendorName(q.vendor_id || "")} requested changes
                    </p>
                    {q.change_request_notes && (
                      <p className="text-amber-900/90 dark:text-amber-100/90 whitespace-pre-line">{q.change_request_notes}</p>
                    )}
                    {(q.attachments || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {(q.attachments || []).map((a, i) => (
                          <a key={i} href={a.url} target="_blank" rel="noreferrer" className="underline text-amber-800 dark:text-amber-200">{a.name}</a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {/* Per-term T&C responses surfaced from submitted quotes */}
                {vendorQuotes
                  .filter((q) => Array.isArray(q.term_responses) && (q.term_responses || []).length > 0)
                  .map((q) => {
                    const responses = q.term_responses || [];
                    const changes = responses.filter((r) => r.response === "change");
                    if (changes.length === 0) return null;
                    return (
                      <div key={`tr-${q.id}`} className="rounded-md border border-amber-300 bg-amber-50/60 dark:bg-amber-900/10 p-2 text-[11px] space-y-1.5">
                        <p className="font-medium text-amber-800 dark:text-amber-300">
                          {vendorName(q.vendor_id || "")} requested changes on {changes.length} of {responses.length} terms
                        </p>
                        <ul className="space-y-1.5">
                          {responses.map((r, i) => (
                            <li key={i} className="flex gap-2">
                              <span className={`shrink-0 mt-0.5 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${r.response === "accept" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-amber-200 text-amber-900 dark:bg-amber-800/60 dark:text-amber-100"}`}>
                                {r.response === "accept" ? "Accepted" : "Change"}
                              </span>
                              <div className="min-w-0">
                                <div className="text-foreground/80 whitespace-pre-line"><span className="text-muted-foreground">{i + 1}.</span> {r.term}</div>
                                {r.response === "change" && r.comment && (
                                  <div className="mt-0.5 text-amber-900/90 dark:text-amber-100/90 whitespace-pre-line"><span className="font-medium">Vendor:</span> {r.comment}</div>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
              </CardContent>
            </Card>
          )}


          <Card ref={lineItemsRef}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setComparisonCollapsed((c) => !c)}
                  className="flex items-center gap-1.5 text-left"
                  aria-expanded={!comparisonCollapsed}
                >
                  {comparisonCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  <CardTitle className="text-base">{isTransfer ? "Transfer Items" : "Vendor Comparison"}</CardTitle>
                  <span className="text-[11px] text-muted-foreground">({rateLines.length} item{rateLines.length !== 1 ? "s" : ""})</span>
                </button>
                {!isTransfer && !comparisonCollapsed && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={comparisonFilter} onValueChange={(v) => setComparisonFilter(v as any)}>
                      <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All vendors</SelectItem>
                        <SelectItem value="quoted">Quoted only</SelectItem>
                        <SelectItem value="selected">Selected only</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={comparisonSort} onValueChange={(v) => setComparisonSort(v as any)}>
                      <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rate">Sort: Lowest Rate</SelectItem>
                        <SelectItem value="delivery">Sort: Fastest Delivery</SelectItem>
                        <SelectItem value="discount">Sort: Highest Discount</SelectItem>
                        <SelectItem value="payment">Sort: Payment Terms</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </CardHeader>
            {!comparisonCollapsed && (
            <CardContent className="space-y-2">
              {(() => {
                const INITIAL_VISIBLE = 2;
                const totalLines = rateLines.length;
                const hiddenCount = Math.max(0, totalLines - INITIAL_VISIBLE);
                const visibleLines = showAllLines || totalLines <= INITIAL_VISIBLE
                  ? rateLines
                  : rateLines.slice(0, INITIAL_VISIBLE);
                return (<>
              {visibleLines.map((l) => {
                const amt = (parseFloat(l.rate) || 0) * (l.qty || 0);
                const tag = rateSourceLabel(l);
                const submittedQuotes = quotesForItem(l.id).filter((q) => q.status === "submitted");
                const lineVendorNames = (l.vendor_ids || []).map((id) => vendorName(id)).filter(Boolean);
                const shownVendors = lineVendorNames.slice(0, 2);
                const extraVendors = lineVendorNames.slice(2);
                return (
                  <div key={l.id} className="rounded-lg border p-2.5 bg-muted/30 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium">{productName(l.product_id)}</div>
                      {!isTransfer && lineVendorNames.length > 0 && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground max-w-[55%]">
                          <span className="truncate" title={shownVendors.join(", ")}>
                            {shownVendors.join(", ")}
                          </span>
                          {extraVendors.length > 0 && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button type="button" className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium hover:bg-muted-foreground/20" aria-label={`Show ${extraVendors.length} more vendors`}>
                                  <Info className="h-3 w-3" />+{extraVendors.length}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent align="end" className="w-56 p-2">
                                <p className="text-[11px] font-medium mb-1">Selected vendors ({lineVendorNames.length})</p>
                                <ul className="text-[11px] space-y-0.5 max-h-48 overflow-y-auto">
                                  {lineVendorNames.map((n, i) => (<li key={i} className="truncate">{n}</li>))}
                                </ul>
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                      )}
                    </div>

                    {isTransfer ? (
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Qty</Label>
                        <div className="h-8 flex items-center text-sm">{l.qty} {l.uom || ""}</div>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-2 items-end">
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Qty</Label>
                            <div className="h-8 flex items-center text-sm">{l.qty} {l.uom || ""}</div>
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Rate</Label>
                            <div className="h-8 flex items-center text-sm" title="Auto-populated from the selected vendor's quote">
                              {parseFloat(l.rate) > 0 ? fmtAmt(parseFloat(l.rate)) : <span className="text-muted-foreground">—</span>}
                            </div>
                          </div>

                          <div>
                            <Label className="text-[10px] text-muted-foreground">Amount</Label>
                            <div className="h-8 flex items-center text-sm font-medium">{fmtAmt(amt)}</div>
                          </div>
                        </div>
                        {tag && (
                          <Badge variant="outline" className="text-[10px] font-normal">{tag}</Badge>
                        )}

                        {/* Submitted quote comparison for this line item */}
                        {(() => {
                          const rawRows = submittedQuotes.map((q) => {
                            const qi = (q.procurement_vendor_quote_items || []).find((x) => x.procurement_item_id === l.id);
                            const rate = qi ? Number(qi.rate_after_discount ?? qi.rate) || 0 : null;
                            return { q, qi, rate };
                          });
                          const priced = rawRows.filter((r) => r.rate != null && r.qi);
                          if (priced.length === 0) {
                            return (
                              <div className="rounded-md border p-2 text-[11px] text-muted-foreground">
                                No quotations received yet
                              </div>
                            );
                          }
                          const winnerVid = l.rate_source === "quote" ? l.rate_source_vendor_id : null;
                          const hasWinner = !!winnerVid && priced.some((r) => r.q.vendor_id === winnerVid);
                          const rates = priced.map((r) => r.rate as number);
                          const minRate = Math.min(...rates);
                          const maxRate = Math.max(...rates);
                          const deliveryDates = priced.map((r) => r.qi?.delivery_commitment_date).filter((d): d is string => !!d);
                          const minDelivery = deliveryDates.length ? [...deliveryDates].sort()[0] : null;
                          const maxDiscount = Math.max(...priced.map((r) => Number(r.qi?.discount_pct) || 0));

                          // Best overall = lowest rate AND (if delivery available) also fastest
                          const bestOverallVid = (() => {
                            const rateWinners = priced.filter((r) => r.rate === minRate);
                            if (rateWinners.length === 1) return rateWinners[0].q.vendor_id;
                            const both = rateWinners.find((r) => r.qi?.delivery_commitment_date === minDelivery);
                            return (both || rateWinners[0]).q.vendor_id;
                          })();

                          // Apply filter — once a vendor is selected for this line, hide the others.
                          let rows = rawRows.filter((r) => {
                            if (hasWinner) return r.q.vendor_id === winnerVid;
                            if (comparisonFilter === "quoted") return r.qi && r.rate != null;
                            if (comparisonFilter === "selected") return false;
                            return true;
                          });
                          // Apply sort
                          const paymentRank = (s: string) => {
                            const idx = (PAYMENT_TERMS as readonly string[]).indexOf(s);
                            return idx === -1 ? 999 : idx;
                          };
                          rows = [...rows].sort((a, b) => {
                            if (comparisonSort === "rate") return (a.rate ?? Infinity) - (b.rate ?? Infinity);
                            if (comparisonSort === "delivery") {
                              const ad = a.qi?.delivery_commitment_date || "9999-12-31";
                              const bd = b.qi?.delivery_commitment_date || "9999-12-31";
                              return ad.localeCompare(bd);
                            }
                            if (comparisonSort === "discount") return (Number(b.qi?.discount_pct) || 0) - (Number(a.qi?.discount_pct) || 0);
                            if (comparisonSort === "payment") return paymentRank(a.q.vendor_payment_term || "") - paymentRank(b.q.vendor_payment_term || "");
                            return 0;
                          });

                          return (
                            <div className="space-y-1.5 rounded-md border p-2 overflow-x-auto">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <p className="text-[11px] font-medium">
                                  {hasWinner ? "Selected vendor for this item" : (priced.length >= 2 ? `Compare submitted quotes (${priced.length})` : "Submitted quote for this item")}
                                </p>
                                {priced.length >= 2 && maxRate > minRate && (
                                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400">
                                    Potential savings: {fmtAmt((maxRate - minRate) * (l.qty || 0))} vs highest
                                  </span>
                                )}
                              </div>
                              <table className="w-full text-[11px]">
                                <thead className="text-muted-foreground">
                                  <tr className="text-left">
                                    <th className="py-1 pr-2">Vendor</th>
                                    <th className="py-1 pr-2">Rate</th>
                                    <th className="py-1 pr-2">Disc %</th>
                                    <th className="py-1 pr-2">After Disc.</th>
                                    <th className="py-1 pr-2">Amount</th>
                                    <th className="py-1 pr-2">Variance</th>
                                    <th className="py-1 pr-2">Delivery</th>
                                    <th className="py-1 pr-2">Payment</th>
                                    <th className="py-1 pr-2 text-right">Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map(({ q, qi, rate }) => {
                                    const isWinner = hasWinner && q.vendor_id === winnerVid;
                                    const isLoser = hasWinner && !isWinner;
                                    const canSelect = rate != null && qi;
                                    const isMinRate = canSelect && priced.length >= 2 && rate === minRate;
                                    const isMinDelivery = priced.length >= 2 && !!qi?.delivery_commitment_date && qi.delivery_commitment_date === minDelivery;
                                    const isMaxDiscount = priced.length >= 2 && (Number(qi?.discount_pct) || 0) === maxDiscount && maxDiscount > 0;
                                    const isBestOverall = priced.length >= 2 && q.vendor_id === bestOverallVid;
                                    const variancePct = canSelect && minRate > 0 && rate != null ? ((rate - minRate) / minRate) * 100 : null;
                                    const lineAmount = canSelect && rate != null ? rate * (l.qty || 0) : null;
                                    return (
                                      <tr key={q.id} className={`border-t align-top ${isLoser ? "opacity-70" : ""} ${isWinner ? "bg-emerald-50/50 dark:bg-emerald-950/20" : ""}`}>
                                        <td className="py-1.5 pr-2 font-medium">
                                          <div className="flex flex-col gap-0.5">
                                            <span>{vendorName(q.vendor_id || "")}</span>
                                            <div className="flex flex-wrap gap-1">
                                              {isWinner && <Badge className="h-4 px-1.5 text-[9px] bg-emerald-600 hover:bg-emerald-600">✓ Selected</Badge>}
                                              {isBestOverall && !isWinner && <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-emerald-500 text-emerald-700 dark:text-emerald-400">★ Best Overall</Badge>}
                                            </div>
                                          </div>
                                        </td>
                                        <td className="py-1.5 pr-2">{qi ? fmtAmt(Number(qi.rate) || 0) : "-"}</td>
                                        <td className="py-1.5 pr-2">
                                          {qi ? (
                                            <span className={isMaxDiscount ? "inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium" : ""}>
                                              {Number(qi.discount_pct) || 0}%
                                              {isMaxDiscount && <span title="Highest discount">🏷</span>}
                                            </span>
                                          ) : "-"}
                                        </td>
                                        <td className="py-1.5 pr-2">
                                          <span className={isMinRate ? "inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium" : ""}>
                                            {rate != null ? fmtAmt(rate) : "-"}
                                            {isMinRate && <Badge variant="outline" className="h-4 px-1 text-[9px] border-emerald-500 text-emerald-700 dark:text-emerald-400">Lowest</Badge>}
                                          </span>
                                        </td>
                                        <td className="py-1.5 pr-2">{lineAmount != null ? fmtAmt(lineAmount) : "-"}</td>
                                        <td className="py-1.5 pr-2">
                                          {variancePct == null ? "-" : variancePct === 0 ? (
                                            <span className="text-emerald-700 dark:text-emerald-400">Base</span>
                                          ) : (
                                            <span className="text-amber-700 dark:text-amber-400">+{variancePct.toFixed(1)}%</span>
                                          )}
                                        </td>
                                        <td className="py-1.5 pr-2">
                                          <span className={isMinDelivery ? "inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium" : ""}>
                                            {qi?.delivery_commitment_date || "-"}
                                            {isMinDelivery && <Badge variant="outline" className="h-4 px-1 text-[9px] border-emerald-500 text-emerald-700 dark:text-emerald-400">Fastest</Badge>}
                                          </span>
                                        </td>
                                        <td className="py-1.5 pr-2">{q.vendor_payment_term || "-"}</td>
                                        <td className="py-1.5 pr-2 text-right">
                                          {canSelect ? (
                                            <Button type="button" size="sm" variant={isWinner ? "secondary" : "outline"} className="h-6 text-[11px]" disabled={!poUnlocked || ratesLocked || isWinner} onClick={() => applyLineQuote(l.id, q)}>
                                              {isWinner ? "Selected" : "Select"}
                                            </Button>
                                          ) : (
                                            <span className="text-muted-foreground">Not quoted</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          );
                        })()}

                      </>
                    )}
                  </div>
                );
              })}
              {hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllLines((s) => !s)}
                  className="w-full flex items-center justify-center gap-1 rounded-md border border-dashed py-1.5 text-xs text-muted-foreground hover:bg-muted/50"
                >
                  {showAllLines ? (<><ChevronUp className="h-3.5 w-3.5" />Show less</>) : (<><ChevronDown className="h-3.5 w-3.5" />Show {hiddenCount} more item{hiddenCount > 1 ? "s" : ""}</>)}
                </button>
              )}
              </>); })()}
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
            )}



          </Card>

          {/* Vendor financials are now inlined inside the Assign Vendors table (row expand). */}

          {/* Vendor GRN / Invoice actions live inside each vendor's expanded row in "Assign Vendors" above. */}
          {!isTransfer && order.status === "Invoice Received" && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <span className="font-semibold">Awaiting payment —</span>
              <span>record a payment against an invoice to mark this PO as <strong>Paid</strong>. Adding another invoice will not advance the stage.</span>
            </div>
          )}


          {/* Internal transfers still need a simple GRN list (no vendor concept) */}
          {isTransfer && (
            <Card>
              <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" />Goods Receipts</CardTitle>
                {canReceive && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setScopedVendorId(null); setGrnOpen(true); }}>Receive Goods</Button>}
              </CardHeader>
              <CardContent className="space-y-2">
                {grns.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No receipts yet.</p>
                ) : grns.map((g) => (
                  <div
                    key={g.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedGrn(g)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedGrn(g); } }}
                    className="flex items-center justify-between text-sm border-b last:border-b-0 py-1.5 -mx-2 px-2 rounded cursor-pointer hover:bg-muted/60 transition-colors"
                  >
                    <div>
                      <div className="font-medium">{g.grn_number}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {g.receipt_date}{g.received_by ? ` · ${g.received_by}` : ""}
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-[10px] ${statusColor(g.status)}`}>{g.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
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
              <AlertDialogAction disabled={busy} onClick={() => { if (prevStage) { revertGuardRef.current = prevStage; changeStatus(prevStage, false); } }}>
                Revert
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>


        {grnOpen && (() => {
          const scopedVendors = scopedVendorId
            ? [{ id: scopedVendorId, name: vendorName(scopedVendorId) }]
            : derivedVendorIds.map((id) => ({ id, name: vendorName(id) }));
          return (
            <GRNForm
              open={grnOpen} onOpenChange={(o) => { setGrnOpen(o); if (!o) setScopedVendorId(null); }}
              poId={order.id} poNumber={order.po_number || (isTransfer ? "(No TRF #)" : "(No PO #)")}
              vendorId={isTransfer ? null : (scopedVendorId || order.vendor_id)}
              sourceType={order.source_type}
              transferFromSiteName={isTransfer ? siteName(order.transfer_from_site_id) : undefined}
              items={items} alreadyReceived={receivedByItem}
              productName={productName} createdBy={currentUserId}
              poVendors={scopedVendors}
              itemVendorMap={scopedItemVendorMap}
              onSaved={() => { fetchSub(); onChanged(); }}
            />
          );
        })()}
        {invOpen && (() => {
          const scopedVendors = scopedVendorId
            ? [{ id: scopedVendorId, name: vendorName(scopedVendorId) }]
            : derivedVendorIds.map((id) => ({ id, name: vendorName(id) }));
          return (
            <InvoiceForm
              open={invOpen} onOpenChange={(o) => { setInvOpen(o); if (!o) setScopedVendorId(null); }}
              poId={order.id} poNumber={order.po_number || "(No PO #)"}
              vendorNameStr={vendorName(scopedVendorId || order.vendor_id)}
              items={items} productName={productName} createdBy={currentUserId}
              poVendors={scopedVendors}
              itemVendorMap={scopedItemVendorMap}
              existingInvoices={invoices.map((i) => ({
                invoice_number: i.invoice_number,
                invoice_amount: Number(i.invoice_amount || 0),
                vendor_id: i.vendor_id,
              }))}
              onSaved={() => { fetchSub(); onChanged(); }}
            />
          );
        })()}





        {selectedGrn && (
          <GRNDetail
            open={!!selectedGrn}
            onOpenChange={(o) => { if (!o) setSelectedGrn(null); }}
            grn={{
              id: selectedGrn.id,
              grn_number: selectedGrn.grn_number,
              receipt_date: selectedGrn.receipt_date,
              status: selectedGrn.status,
              received_by: selectedGrn.received_by,
              remarks: selectedGrn.remarks,
              po_id: order.id,
              photos: selectedGrn.photos ?? null,
              po: { po_number: order.po_number ?? null, vendor_id: order.vendor_id ?? null, site_id: order.site_id ?? null },
            }}
            vendorName={selectedGrn.vendor_id ? vendorName(selectedGrn.vendor_id) : vendorName(order.vendor_id)}
            onSaved={() => { fetchSub(); onChanged(); }}
          />
        )}

        {selectedInvoiceId && (() => {
          const inv = invoices.find((x) => x.id === selectedInvoiceId);
          if (!inv) return null;
          const lineItems = invItems.filter((ii) => (ii as any).invoice_id === inv.id);
          const payments = invPayments.filter((p) => p.invoice_id === inv.id);
          const paidTotal = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
          const balance = Number(inv.invoice_amount || 0) - paidTotal;
          return (
            <Dialog open={!!selectedInvoiceId} onOpenChange={(o) => { if (!o) setSelectedInvoiceId(null); }}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    {inv.invoice_number || "Invoice"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <div><div className="text-xs text-muted-foreground">Invoice Date</div><div className="font-medium">{inv.invoice_date || "—"}</div></div>
                    <div><div className="text-xs text-muted-foreground">Vendor</div><div className="font-medium">{inv.vendor_id ? vendorName(inv.vendor_id) : "—"}</div></div>
                    <div><div className="text-xs text-muted-foreground">Invoice Amount</div><div className="font-medium">{fmtAmt(inv.invoice_amount)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Paid / Balance</div><div className="font-medium">{fmtAmt(paidTotal)} <span className="text-muted-foreground">/</span> {fmtAmt(balance)}</div></div>
                  </div>
                  {lineItems.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold mb-1">Line Items</div>
                      <div className="border rounded divide-y">
                        {lineItems.map((li, idx) => {
                          const it = items.find((x) => x.id === li.procurement_item_id);
                          return (
                            <div key={idx} className="flex items-center justify-between px-2 py-1.5">
                              <div className="text-xs">{it ? productName(it.product_id) : "—"}</div>
                              <div className="text-xs font-medium">{fmtAmt(li.invoiced_rate)}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {(() => {
                    const atts = invAttachments.filter((a) => a.invoice_id === inv.id);
                    if (atts.length === 0) return null;
                    return (
                      <div>
                        <div className="text-xs font-semibold mb-1">Attachments</div>
                        <div className="border rounded divide-y">
                          {atts.map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              className="w-full flex items-center justify-between px-2 py-1.5 text-xs hover:bg-muted/50 text-left"
                              onClick={async () => {
                                try {
                                  const url = await resolveInvoiceFileUrl(a.file_path);
                                  if (url) window.open(url, "_blank", "noopener,noreferrer");
                                  else toast.error("Could not open attachment");
                                } catch (e: any) {
                                  toast.error(e?.message || "Could not open attachment");
                                }
                              }}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className="truncate">{a.file_name}</span>
                              </div>
                              <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs font-semibold">Payments</div>
                      {balance > 0.005 && !payForm.open && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setPayForm({ open: true, payment_date: new Date().toISOString().slice(0, 10), amount: balance.toFixed(2), reference: "", notes: "" })}
                        >
                          <Plus className="h-3 w-3 mr-1" />Record Payment
                        </Button>
                      )}
                    </div>
                    {payments.length === 0 && !payForm.open ? (
                      <p className="text-xs text-muted-foreground">No payments recorded yet.</p>
                    ) : payments.length > 0 && (
                      <div className="border rounded divide-y">
                        {payments.map((p, idx) => (
                          <div key={idx} className="flex items-center justify-between px-2 py-1.5 text-xs">
                            <div>
                              <div>{p.payment_date || "—"}{p.reference_number ? ` · ${p.reference_number}` : ""}</div>
                              {p.notes && <div className="text-muted-foreground text-[11px] mt-0.5">{p.notes}</div>}
                            </div>
                            <div className="font-medium">{fmtAmt(p.amount)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {payForm.open && (
                      <div className="mt-2 border rounded-md p-3 space-y-2 bg-muted/30">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[11px]">Payment Date</Label>
                            <Input
                              type="date"
                              className="h-8 text-xs"
                              value={payForm.payment_date}
                              onChange={(e) => setPayForm((f) => ({ ...f, payment_date: e.target.value }))}
                            />
                          </div>
                          <div>
                            <Label className="text-[11px]">Amount</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="h-8 text-xs"
                              value={payForm.amount}
                              onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
                            />
                          </div>
                          <div>
                            <Label className="text-[11px]">Reference / Number</Label>
                            <Input
                              className="h-8 text-xs"
                              value={payForm.reference}
                              onChange={(e) => setPayForm((f) => ({ ...f, reference: e.target.value }))}
                              placeholder="UTR, cheque #, etc."
                            />
                          </div>
                          <div>
                            <Label className="text-[11px]">Notes</Label>
                            <Input
                              className="h-8 text-xs"
                              value={payForm.notes}
                              onChange={(e) => setPayForm((f) => ({ ...f, notes: e.target.value }))}
                              placeholder="Optional"
                            />
                          </div>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Remaining balance: <span className="font-medium">{fmtAmt(balance)}</span>
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            disabled={paySaving}
                            onClick={() => setPayForm((f) => ({ ...f, open: false }))}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            disabled={paySaving}
                            onClick={async () => {
                              const amt = Number(payForm.amount);
                              if (!isFinite(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
                              if (amt > balance + 0.005) {
                                const ok = window.confirm(`Amount ${fmtAmt(amt)} exceeds remaining balance ${fmtAmt(balance)}. Continue?`);
                                if (!ok) return;
                              }
                              setPaySaving(true);
                              const { error } = await supabase.from("procurement_invoice_payments").insert({
                                invoice_id: inv.id,
                                amount: amt,
                                payment_date: payForm.payment_date || null,
                                reference_number: payForm.reference || null,
                                notes: payForm.notes || null,
                                created_by: currentUserId ?? null,
                              });
                              setPaySaving(false);
                              if (error) { toast.error(error.message); return; }
                              toast.success("Payment recorded");
                              setPayForm({ open: false, payment_date: new Date().toISOString().slice(0, 10), amount: "", reference: "", notes: "" });
                              await fetchSub();
                              onChanged();
                            }}
                          >
                            <Save className="h-3 w-3 mr-1" />{paySaving ? "Saving..." : "Save Payment"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          );
        })()}

        {/* Historical quote-version viewer (read-only) */}
        {viewQuoteId && (() => {
          const q = allVendorQuotes.find((x) => x.id === viewQuoteId);
          if (!q) return null;
          const latest = allVendorQuotes.find((x) => x.vendor_id === q.vendor_id && x.is_latest);
          const items = q.procurement_vendor_quote_items || [];
          const latestItems = latest?.procurement_vendor_quote_items || [];
          const compare = latest && latest.id !== q.id;
          const findLatest = (pid: string | null) => latestItems.find((x) => x.procurement_item_id === pid);
          const vendorVersions = allVendorQuotes
            .filter((x) => x.vendor_id === q.vendor_id)
            .sort((a, b) => (b.version || 1) - (a.version || 1));
          let totalBefore = 0;
          let totalAfter = 0;
          items.forEach((it) => {
            const line = rateLines.find((l) => l.id === it.procurement_item_id);
            const qty = Number(line?.qty || 0);
            const rate = Number(it.rate) || 0;
            const after = Number(it.rate_after_discount ?? it.rate) || 0;
            totalBefore += rate * qty;
            totalAfter += after * qty;
          });
          const totalDiscount = totalBefore - totalAfter;
          return (
            <Dialog open={!!viewQuoteId} onOpenChange={(o) => { if (!o) setViewQuoteId(null); }}>
              <DialogContent className="max-w-none w-[95vw] h-[95vh] p-0 flex flex-col gap-0 overflow-hidden">
                <DialogHeader className="px-5 py-3 border-b bg-muted/30 shrink-0">
                  <DialogTitle className="flex items-center gap-2 text-base flex-wrap">
                    <span>Quote V{q.version || 1} — {vendorName(q.vendor_id || "")}</span>
                    <span className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium bg-background">{q.status}</span>
                    {q.is_latest && <span className="inline-flex items-center rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase">Active</span>}
                    <span className="ml-auto text-[11px] font-normal text-muted-foreground">Quote ID: {q.id.slice(0, 8)}</span>
                  </DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-xs">
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 rounded border bg-muted/20 p-3">
                    <div><div className="text-[10px] uppercase text-muted-foreground">Vendor</div><div className="font-medium">{vendorName(q.vendor_id || "") || "—"}</div></div>
                    <div><div className="text-[10px] uppercase text-muted-foreground">Version</div><div>V{q.version || 1}{q.is_latest ? " (Active)" : " (Archived)"}</div></div>
                    <div><div className="text-[10px] uppercase text-muted-foreground">Status</div><div>{q.status}</div></div>
                    <div><div className="text-[10px] uppercase text-muted-foreground">Submitted</div><div>{q.submitted_at ? fmtDT(q.submitted_at) : "—"}</div></div>
                    <div><div className="text-[10px] uppercase text-muted-foreground">First Submitted</div><div>{q.first_submitted_at ? fmtDT(q.first_submitted_at) : "—"}</div></div>
                    <div><div className="text-[10px] uppercase text-muted-foreground">Reopened</div><div>{q.reopened_at ? fmtDT(q.reopened_at) : "—"}</div></div>
                    <div><div className="text-[10px] uppercase text-muted-foreground">Payment Terms</div><div>{q.vendor_payment_term || "—"}</div></div>
                    <div className="md:col-span-3 lg:col-span-5"><div className="text-[10px] uppercase text-muted-foreground">Delivery Commitment</div><div>{items.map((it) => it.delivery_commitment_date).filter(Boolean)[0] || "—"}</div></div>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground mb-1">Line Items{compare ? " (compared with active version)" : ""}</div>
                    <div className="border rounded overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead className="bg-muted/50 text-muted-foreground">
                          <tr>
                            <th className="p-2 text-left">#</th>
                            <th className="p-2 text-left">Item</th>
                            <th className="p-2 text-right">Qty</th>
                            <th className="p-2 text-left">UOM</th>
                            <th className="p-2 text-right">Rate</th>
                            <th className="p-2 text-right">Disc %</th>
                            <th className="p-2 text-right">Disc Amt</th>
                            <th className="p-2 text-right">After Disc.</th>
                            <th className="p-2 text-right">Line Total</th>
                            <th className="p-2">Delivery</th>
                            {compare && <th className="p-2 text-right">Active After Disc.</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it, idx) => {
                            const line = rateLines.find((l) => l.id === it.procurement_item_id);
                            const l2 = compare ? findLatest(it.procurement_item_id) : null;
                            const diff = l2 ? Number(l2.rate_after_discount ?? l2.rate) - Number(it.rate_after_discount ?? it.rate) : 0;
                            const qty = Number(line?.qty || 0);
                            const rate = Number(it.rate) || 0;
                            const after = Number(it.rate_after_discount ?? it.rate) || 0;
                            const discAmt = (rate - after) * qty;
                            const lineTotal = after * qty;
                            return (
                              <tr key={(it as any).id || `${q.id}-${it.procurement_item_id}`} className="border-t">
                                <td className="p-2 text-muted-foreground">{idx + 1}</td>
                                <td className="p-2">{line ? productName(line.product_id) : it.procurement_item_id}</td>
                                <td className="p-2 text-right">{qty || "—"}</td>
                                <td className="p-2">{line?.uom || "—"}</td>
                                <td className="p-2 text-right">{fmtAmt(rate)}</td>
                                <td className="p-2 text-right">{Number(it.discount_pct) || 0}%</td>
                                <td className="p-2 text-right">{fmtAmt(discAmt)}</td>
                                <td className="p-2 text-right">{fmtAmt(after)}</td>
                                <td className="p-2 text-right font-medium">{fmtAmt(lineTotal)}</td>
                                <td className="p-2">{it.delivery_commitment_date || "—"}</td>
                                {compare && (
                                  <td className="p-2 text-right">
                                    {l2 ? (
                                      <>
                                        {fmtAmt(Number(l2.rate_after_discount ?? l2.rate) || 0)}
                                        {Math.abs(diff) > 0.005 && (
                                          <span className={`ml-1 text-[10px] ${diff > 0 ? "text-red-600" : "text-emerald-600"}`}>
                                            {diff > 0 ? "▲" : "▼"} {fmtAmt(Math.abs(diff))}
                                          </span>
                                        )}
                                      </>
                                    ) : "—"}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-muted/30 font-medium">
                          <tr className="border-t">
                            <td colSpan={8} className="p-2 text-right text-muted-foreground">Total Before Discount</td>
                            <td className="p-2 text-right">{fmtAmt(totalBefore)}</td>
                            <td colSpan={compare ? 2 : 1}></td>
                          </tr>
                          <tr>
                            <td colSpan={8} className="p-2 text-right text-muted-foreground">Total Discount</td>
                            <td className="p-2 text-right text-emerald-700">− {fmtAmt(totalDiscount)}</td>
                            <td colSpan={compare ? 2 : 1}></td>
                          </tr>
                          <tr className="border-t">
                            <td colSpan={8} className="p-2 text-right text-sm font-semibold">Grand Total</td>
                            <td className="p-2 text-right text-sm font-bold text-primary">{fmtAmt(totalAfter)}</td>
                            <td colSpan={compare ? 2 : 1}></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {q.notes && (
                      <div className="rounded border p-3">
                        <div className="text-[10px] uppercase text-muted-foreground mb-1">Vendor Remarks</div>
                        <p className="whitespace-pre-line">{q.notes}</p>
                      </div>
                    )}
                    {q.change_request_notes && (
                      <div className="rounded border p-3">
                        <div className="text-[10px] uppercase text-muted-foreground mb-1">Change Request Notes</div>
                        <p className="whitespace-pre-line">{q.change_request_notes}</p>
                      </div>
                    )}
                  </div>

                  {Array.isArray(q.term_responses) && q.term_responses.length > 0 && (
                    <div className="rounded border p-3">
                      <div className="text-[10px] uppercase text-muted-foreground mb-2">Terms & Conditions Responses</div>
                      <ul className="space-y-1.5">
                        {q.term_responses.map((r, i) => (
                          <li key={i} className="flex gap-2">
                            <span className={`shrink-0 mt-0.5 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${r.response === "accept" ? "bg-emerald-100 text-emerald-800" : "bg-amber-200 text-amber-900"}`}>
                              {r.response === "accept" ? "Accepted" : "Change"}
                            </span>
                            <div className="min-w-0">
                              <div>{i + 1}. {r.term}</div>
                              {r.response === "change" && r.comment && <div className="text-muted-foreground mt-0.5">Vendor: {r.comment}</div>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {Array.isArray(q.attachments) && q.attachments.length > 0 && (
                    <div className="rounded border p-3">
                      <div className="text-[10px] uppercase text-muted-foreground mb-1">Attachments</div>
                      <ul className="space-y-0.5">
                        {q.attachments.map((a, i) => (
                          <li key={i}><a className="text-primary underline break-all" href={a.url} target="_blank" rel="noreferrer">{a.name || `Attachment ${i + 1}`}</a></li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {vendorVersions.length > 1 && (
                    <div className="rounded border p-3">
                      <div className="text-[10px] uppercase text-muted-foreground mb-2">Quote History ({vendorVersions.length} versions)</div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px]">
                          <thead className="bg-muted/50 text-muted-foreground">
                            <tr>
                              <th className="p-1.5 text-left">Version</th>
                              <th className="p-1.5 text-left">Status</th>
                              <th className="p-1.5 text-left">Submitted</th>
                              <th className="p-1.5 text-right">Grand Total</th>
                              <th className="p-1.5"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {vendorVersions.map((v) => {
                              const vTotal = (v.procurement_vendor_quote_items || []).reduce((s, it) => {
                                const line = rateLines.find((l) => l.id === it.procurement_item_id);
                                return s + (Number(it.rate_after_discount ?? it.rate) || 0) * Number(line?.qty || 0);
                              }, 0);
                              const isCurrent = v.id === q.id;
                              return (
                                <tr key={v.id} className={`border-t ${isCurrent ? "bg-primary/5" : ""}`}>
                                  <td className="p-1.5 font-medium">V{v.version || 1}{v.is_latest && <span className="ml-1 text-[9px] text-primary">ACTIVE</span>}</td>
                                  <td className="p-1.5">{v.status}</td>
                                  <td className="p-1.5">{v.submitted_at ? fmtDT(v.submitted_at) : "—"}</td>
                                  <td className="p-1.5 text-right">{fmtAmt(vTotal)}</td>
                                  <td className="p-1.5 text-right">
                                    {!isCurrent && (
                                      <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setViewQuoteId(v.id)}>View</Button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {!q.is_latest && (
                    <p className="text-[11px] text-muted-foreground italic">This is an archived version kept for audit. The latest submitted version is the active quote used for PO generation.</p>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          );
        })()}


      </DialogContent>
    </Dialog>
  );
}
