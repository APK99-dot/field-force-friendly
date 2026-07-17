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
import { toast } from "sonner";
import { useModuleConfig } from "@/hooks/useModuleConfig";
import { useUserProfile } from "@/hooks/useUserProfile";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CalendarDays, Truck, FileText, Pencil, ChevronRight, ChevronDown, Save, ArrowRight, Undo2, Download, MessageCircle, Link2, Copy, Plus, Trash2, Search, X } from "lucide-react";
import {
  STATUS_FLOW, allowedTransitions, statusColor, fmtAmt, PAYMENT_TERMS, statusFlowFor, type ProcStatus,
} from "@/lib/procurement";
import jsPDF from "jspdf";
import { downloadPDF } from "@/utils/nativeDownload";
import GRNForm, { type POItem } from "./GRNForm";
import InvoiceForm from "./InvoiceForm";
import GRNDetail from "./GRNDetail";
import ThreeWayMatch from "./ThreeWayMatch";
import { fetchAddressOptions, formatAddressSnapshot, type AddressOption } from "@/lib/addresses";

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

interface GrnRow { id: string; grn_number: string | null; receipt_date: string; status: string; received_by: string | null; remarks: string | null; vendor_id: string | null; photos?: string[] | null; }
interface GrnItemRow { grn_id: string; procurement_item_id: string | null; received_qty: number; }
interface InvRow { id: string; invoice_number: string | null; invoice_date: string; invoice_amount: number; vendor_id: string | null; }
interface InvItemRow { invoice_id: string; procurement_item_id: string | null; invoiced_rate: number; }
interface InvPaymentRow { invoice_id: string; amount: number; payment_date: string | null; reference_number: string | null; }

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
  change_request_notes?: string | null;
  attachments?: { name: string; url: string; size: number; type: string }[] | null;
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
  const [invPayments, setInvPayments] = useState<InvPaymentRow[]>([]);
  const [grnOpen, setGrnOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);
  const [selectedGrn, setSelectedGrn] = useState<GrnRow | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
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
  const lineItemsRef = useRef<HTMLDivElement>(null);
  // Vendor assignment table state: one row per vendor
  const [vendorAssignments, setVendorAssignments] = useState<{ key: string; vendor_id: string; line_ids: string[]; scope: "all" | "specific" }[]>([]);
  const [scopePickerFor, setScopePickerFor] = useState<string | null>(null);
  const [vendorPickerFor, setVendorPickerFor] = useState<string | null>(null);
  const [vendorSearch, setVendorSearch] = useState("");
  const [expandedVendorRow, setExpandedVendorRow] = useState<string | null>(null);
  // Vendor picker for GRN / Invoice creation (which vendor is this receipt / bill for?)
  const [grnVendorId, setGrnVendorId] = useState<string | null>(null);
  const [invVendorId, setInvVendorId] = useState<string | null>(null);

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
          const toDelete = vendorQuotes
            .filter((q) => q.vendor_id === removedVendorId)
            .map((q) => q.id);
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

  // Manual override for a vendor's quote status (upsert quote row if missing)
  const setVendorQuoteStatus = async (row: { vendor_id: string; line_ids: string[] }, status: string) => {
    if (!row.vendor_id) { toast.error("Pick a vendor first."); return; }
    try {
      const existing = vendorQuotes.find((q) => q.vendor_id === row.vendor_id);
      if (existing) {
        const { error } = await supabase.from("procurement_vendor_quotes")
          .update({ status, submitted_at: status === "submitted" ? new Date().toISOString() : existing.submitted_at ?? null })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from("procurement_vendor_quotes").insert({
          po_id: order.id,
          vendor_id: row.vendor_id,
          token: crypto.randomUUID().replace(/-/g, ""),
          procurement_item_ids: row.line_ids,
          status,
          submitted_at: status === "submitted" ? new Date().toISOString() : null,
          created_by: user?.id ?? null,
        });
        if (error) throw error;
      }
      await loadVendorQuotes();
      toast.success("Status updated");
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    }
  };


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
      supabase.from("procurement_invoices").select("*, procurement_invoice_items(*), procurement_invoice_payments(*)").eq("po_id", order.id).order("created_at"),
    ]);
    const gRows = (g.data || []) as any[];
    setGrns(gRows.map((r) => ({ id: r.id, grn_number: r.grn_number, receipt_date: r.receipt_date, status: r.status, received_by: r.received_by, remarks: r.remarks, vendor_id: r.vendor_id ?? null, photos: r.photos ?? null })));
    setGrnItems(gRows.flatMap((r) => (r.procurement_grn_items || []) as GrnItemRow[]));
    const iRows = (inv.data || []) as any[];
    setInvoices(iRows.map((r) => ({ id: r.id, invoice_number: r.invoice_number, invoice_date: r.invoice_date, invoice_amount: r.invoice_amount, vendor_id: r.vendor_id ?? null })));
    setInvItems(iRows.flatMap((r) => (r.procurement_invoice_items || []) as InvItemRow[]));
    setInvPayments(iRows.flatMap((r) => (r.procurement_invoice_payments || []).map((p: any) => ({ invoice_id: r.id, amount: Number(p.amount || 0), payment_date: p.payment_date, reference_number: p.reference_number }))));
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

  const changeStatus = async (
    to: ProcStatus,
    closeAfter = false,
    opts?: { note?: string; actorName?: string; auto?: boolean },
  ) => {
    setBusy(true);
    const entry: StageHistoryEntry = {
      status: to,
      moved_by: currentUserId ?? null,
      moved_by_name: opts?.actorName || moverName,
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
    const invoicedTotal = invoices.reduce((s, i) => s + Number(i.invoice_amount || 0), 0);
    const paidTotal = invPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const fullyPaid = hasInvoice && invoicedTotal > 0 && paidTotal >= invoicedTotal - 0.01;

    type Cand = { stage: ProcStatus; note: string; actorName?: string };
    const cands: Cand[] = [];
    if (hasAssignedVendors && hasQuoteLinks) {
      cands.push({ stage: "Quote Requested", note: "Quote link generated" });
    }
    if (lineHasRate) {
      // Prefer to attribute to a vendor if a persisted rate was sourced from a quote
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
    if (anyFullyReceived) {
      cands.push({ stage: "Goods Received", note: "GRN marked Fully Received" });
    }
    if (hasInvoice) {
      cands.push({ stage: "Invoice Received", note: "Invoice recorded" });
    }
    if (fullyPaid) {
      cands.push({ stage: "Paid", note: "Payment covers invoice total" });
    }

    // Pick the furthest satisfied stage that is strictly ahead of current.
    let best: Cand | null = null;
    let bestIdx = curIdx;
    for (const c of cands) {
      const idx = STATUS_FLOW.indexOf(c.stage);
      if (idx > bestIdx) { best = c; bestIdx = idx; }
    }
    if (!best) return null;
    return { target: best.stage, note: best.note, actorName: best.actorName };
  }, [isTransfer, order.status, order.procurement_items, vendorAssignments, vendorQuotes, grns, invoices, invPayments, vendorName]);

  useEffect(() => {
    if (!open) return;
    if (autoAdvancingRef.current || busy) return;
    const next = computeAutoTarget();
    if (!next) return;
    autoAdvancingRef.current = true;
    changeStatus(next.target, false, { note: next.note, actorName: next.actorName, auto: true })
      .finally(() => { autoAdvancingRef.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, computeAutoTarget]);


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

  // ---- Vendor quote portal (per line item) ----
  const loadVendorQuotes = useCallback(async () => {
    const { data } = await supabase
      .from("procurement_vendor_quotes")
      .select("id, vendor_id, token, status, vendor_payment_term, notes, submitted_at, procurement_item_ids, change_request_notes, attachments, procurement_vendor_quote_items(*)")
      .eq("po_id", order.id);
    setVendorQuotes((data || []) as unknown as VendorQuoteRow[]);
  }, [order.id]);

  useEffect(() => { if (open) loadVendorQuotes(); }, [open, loadVendorQuotes]);

  // Automatic status refresh: pick up vendor submissions without a page reload
  useEffect(() => {
    if (!open) return;
    const onVisible = () => { if (document.visibilityState === "visible") loadVendorQuotes(); };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(loadVendorQuotes, 30000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [open, loadVendorQuotes]);

  // Auto-apply the rate when a line item has exactly ONE submitted quote and
  // the buyer hasn't already picked/adjusted a rate. Manual "Select" is only
  // required when 2+ vendors have submitted competing quotes for the same line.
  useEffect(() => {
    if (!open || vendorQuotes.length === 0 || rateLines.length === 0) return;
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
        if (rate <= 0) return l;
        changed = true;
        return {
          ...l,
          rate: String(rate),
          rate_source: "quote",
          rate_source_vendor_id: q.vendor_id,
          vendor_ids: q.vendor_id && !l.vendor_ids.includes(q.vendor_id)
            ? [...l.vendor_ids, q.vendor_id]
            : l.vendor_ids,
        };
      });
      return changed ? next : prev;
    });
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
                            {h.note ? <><br/><span className="italic">{h.note}</span></> : null}
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
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Payment Terms</Label>
                      <Select value={poForm.payment_terms || undefined} onValueChange={(v) => setPoForm((p) => ({ ...p, payment_terms: v }))} disabled={!poUnlocked}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Select terms" /></SelectTrigger>
                        <SelectContent>
                          {(PAYMENT_TERMS as readonly string[]).map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                          {poForm.payment_terms && !(PAYMENT_TERMS as readonly string[]).some((t) => t.toLowerCase() === poForm.payment_terms.toLowerCase()) && (
                            <SelectItem key={poForm.payment_terms} value={poForm.payment_terms}>{poForm.payment_terms}</SelectItem>
                          )}
                        </SelectContent>
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
                                <Select
                                  value={qStatus || undefined}
                                  onValueChange={(v) => setVendorQuoteStatus(row, v)}
                                  disabled={!poUnlocked || !row.vendor_id}
                                >
                                  <SelectTrigger className={`h-7 text-[11px] w-full ${
                                    qStatus === "submitted" ? "text-emerald-600 dark:text-emerald-400"
                                    : qStatus === "changes_requested" ? "text-amber-600 dark:text-amber-400"
                                    : ""
                                  }`}>
                                    <SelectValue placeholder="—" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="submitted">Submitted</SelectItem>
                                    <SelectItem value="changes_requested">Changes Requested</SelectItem>
                                  </SelectContent>
                                </Select>
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
                                <td colSpan={6} className="p-3 space-y-3">
                                  {/* Scoped line items + their submitted rates */}
                                  <div>
                                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Items in scope</div>
                                    {scopedLines.length === 0 ? (
                                      <p className="text-[11px] text-muted-foreground">No items selected.</p>
                                    ) : (
                                      <div className="space-y-1">
                                        {scopedLines.map((l) => {
                                          const qi = quote?.procurement_vendor_quote_items?.find((x) => x.procurement_item_id === l.id);
                                          const rate = qi ? Number(qi.rate_after_discount ?? qi.rate) || 0 : null;
                                          return (
                                            <div key={l.id} className="flex items-center gap-2 text-[11px] border-b last:border-b-0 pb-1">
                                              <span className="flex-1 truncate"><span className="font-medium">{productName(l.product_id)}</span> · Qty {l.qty}</span>
                                              <span className="w-20 text-right">{rate != null ? fmtAmt(rate) : <span className="text-muted-foreground">—</span>}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>

                                  {/* Vendor's submitted remarks & attachments */}
                                  {quote && (quote.notes?.trim() || (quote.attachments && quote.attachments.length > 0)) && (
                                    <div className="border-t pt-2 space-y-2">
                                      {quote.notes?.trim() && (
                                        <div>
                                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Vendor Remarks</div>
                                          <p className="text-[11px] whitespace-pre-line">{quote.notes}</p>
                                        </div>
                                      )}
                                      {quote.attachments && quote.attachments.length > 0 && (
                                        <div>
                                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Attachments</div>
                                          <ul className="space-y-0.5">
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
                                    </div>
                                  )}


                                  {/* Financial summary */}
                                  {!isTransfer && finSummary && (
                                    <div className="border-t pt-2">
                                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Financials</div>
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                                        <div><span className="text-muted-foreground">Order: </span><span className="font-medium">{fmtAmt(finSummary.line_amount)}</span></div>
                                        <div><span className="text-muted-foreground">Invoiced: </span><span className="font-medium">{fmtAmt(finSummary.invoiced_total)}</span></div>
                                        <div><span className="text-muted-foreground">Paid: </span><span className="font-medium">{fmtAmt(finSummary.paid_total)}</span></div>
                                        <div><span className="text-muted-foreground">Balance: </span>
                                          <span className={`font-semibold ${finSummary.balance_due > 0.005 ? "text-red-600" : "text-green-600"}`}>{fmtAmt(finSummary.balance_due)}</span>
                                        </div>
                                      </div>
                                      {finSummary.payments.length > 0 && (
                                        <div className="pt-1 mt-1 border-t space-y-0.5">
                                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Payment Schedule</div>
                                          {finSummary.payments.map((p, i) => (
                                            <div key={i} className="flex items-center justify-between text-[11px]">
                                              <span>{p.payment_date || "—"}{p.reference_number ? ` · ${p.reference_number}` : ""}</span>
                                              <span className="font-medium">{fmtAmt(p.amount)}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
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
              </CardContent>
            </Card>
          )}


          <Card ref={lineItemsRef}>
            <CardHeader className="pb-2"><CardTitle className="text-base">{isTransfer ? "Transfer Items" : "Line Items"}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {rateLines.map((l) => {
                const amt = (parseFloat(l.rate) || 0) * (l.qty || 0);
                const tag = rateSourceLabel(l);
                const submittedQuotes = quotesForItem(l.id).filter((q) => q.status === "submitted");
                const lineVendorNames = (l.vendor_ids || []).map((id) => vendorName(id)).filter(Boolean);
                return (
                  <div key={l.id} className="rounded-lg border p-2.5 bg-muted/30 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium">{productName(l.product_id)}</div>
                      {!isTransfer && lineVendorNames.length > 0 && (
                        <span className="text-[10px] text-muted-foreground truncate max-w-[50%]" title={lineVendorNames.join(", ")}>
                          {lineVendorNames.join(", ")}
                        </span>
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
                            <Input
                              type="number" inputMode="decimal" value={l.rate} placeholder="0" className="h-8"
                              disabled={!poUnlocked || ratesLocked}
                              onChange={(e) => setLineRate(l.id, e.target.value)}
                            />
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
                        {submittedQuotes.length > 0 && (() => {
                          const rows = submittedQuotes.map((q) => {
                            const qi = (q.procurement_vendor_quote_items || []).find((x) => x.procurement_item_id === l.id);
                            const rate = qi ? Number(qi.rate_after_discount ?? qi.rate) || 0 : null;
                            return { q, qi, rate };
                          });
                          const priced = rows.filter((r) => r.rate != null && r.qi);
                          const hasCompare = priced.length >= 2;
                          const winnerVid = l.rate_source === "quote" ? l.rate_source_vendor_id : null;
                          const hasWinner = !!winnerVid && priced.some((r) => r.q.vendor_id === winnerVid);
                          const minRate = hasCompare ? Math.min(...priced.map((r) => r.rate as number)) : null;
                          const deliveryDates = priced
                            .map((r) => r.qi?.delivery_commitment_date)
                            .filter((d): d is string => !!d);
                          const minDelivery = deliveryDates.length ? deliveryDates.sort()[0] : null;

                          if (!hasCompare) {
                            return (
                              <div className="space-y-1.5 rounded-md border p-2">
                                <p className="text-[11px] font-medium">Submitted quote for this item</p>
                                {rows.map(({ q, qi, rate }) => (
                                  <div key={q.id} className="flex items-center gap-2 text-[11px]">
                                    <div className="flex-1">
                                      <div className="font-medium">{vendorName(q.vendor_id || "")}</div>
                                      <div className="text-muted-foreground">
                                        {rate != null ? `Rate: ${fmtAmt(rate)}` : "Not quoted"}
                                        {qi?.delivery_commitment_date ? ` · By ${qi.delivery_commitment_date}` : ""}
                                      </div>
                                    </div>
                                    {rate != null && (
                                      <Button type="button" size="sm" variant="outline" className="h-6 text-[11px]" disabled={!poUnlocked || ratesLocked} onClick={() => applyLineQuote(l.id, q)}>
                                        Select
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            );
                          }

                          return (
                            <div className="space-y-1.5 rounded-md border p-2 overflow-x-auto">
                              <p className="text-[11px] font-medium">Compare submitted quotes ({priced.length})</p>
                              <table className="w-full text-[11px]">
                                <thead className="text-muted-foreground">
                                  <tr className="text-left">
                                    <th className="py-1 pr-2">Vendor</th>
                                    <th className="py-1 pr-2">Rate</th>
                                    <th className="py-1 pr-2">Disc %</th>
                                    <th className="py-1 pr-2">After Disc.</th>
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
                                    const isMinRate = canSelect && minRate != null && rate === minRate;
                                    const isMinDelivery = !!qi?.delivery_commitment_date && qi.delivery_commitment_date === minDelivery;
                                    return (
                                      <tr key={q.id} className={`border-t ${isLoser ? "opacity-60" : ""}`}>
                                        <td className="py-1 pr-2 font-medium">
                                          {vendorName(q.vendor_id || "")}
                                          {isWinner && <span className="ml-1 text-emerald-600">✓ Selected</span>}
                                          {isLoser && <span className="ml-1 text-muted-foreground">· Not Selected</span>}
                                        </td>
                                        <td className="py-1 pr-2">{qi ? fmtAmt(Number(qi.rate) || 0) : "-"}</td>
                                        <td className="py-1 pr-2">{qi ? `${Number(qi.discount_pct) || 0}%` : "-"}</td>
                                        <td className="py-1 pr-2">
                                          <span className={isMinRate ? "inline-flex items-center gap-1" : ""}>
                                            {rate != null ? fmtAmt(rate) : "-"}
                                            {isMinRate && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="Lowest rate" />}
                                          </span>
                                        </td>
                                        <td className="py-1 pr-2">
                                          <span className={isMinDelivery ? "inline-flex items-center gap-1" : ""}>
                                            {qi?.delivery_commitment_date || "-"}
                                            {isMinDelivery && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="Earliest delivery" />}
                                          </span>
                                        </td>
                                        <td className="py-1 pr-2">{q.vendor_payment_term || "-"}</td>
                                        <td className="py-1 pr-2 text-right">
                                          {isLoser ? (
                                            <Button type="button" size="sm" variant="ghost" className="h-6 text-[11px]" disabled={!poUnlocked || ratesLocked} onClick={() => canSelect && applyLineQuote(l.id, q)}>
                                              Select
                                            </Button>
                                          ) : canSelect ? (
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

          {/* Vendor financials are now inlined inside the Assign Vendors table (row expand). */}

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
                    <div className="text-[11px] text-muted-foreground">
                      {g.receipt_date}
                      {g.received_by ? ` · ${g.received_by}` : ""}
                      {g.vendor_id ? ` · ${vendorName(g.vendor_id)}` : ""}
                    </div>
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
                    <div className="text-[11px] text-muted-foreground">
                      {i.invoice_date}
                      {i.vendor_id ? ` · ${vendorName(i.vendor_id)}` : ""}
                    </div>
                  </div>
                  <div className="font-medium">{fmtAmt(i.invoice_amount)}</div>
                </div>
              ))}
              {order.status === "Invoice Received" && (
                <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                  <span className="font-semibold">Awaiting payment —</span>
                  <span>record a payment against an invoice to mark this PO as <strong>Paid</strong>. Adding another invoice will not advance the stage.</span>
                </div>
              )}
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
            poVendors={derivedVendorIds.map((id) => ({ id, name: vendorName(id) }))}
            itemVendorMap={itemVendorMap}
            onSaved={() => { fetchSub(); onChanged(); }}
          />
        )}
        {invOpen && (
          <InvoiceForm
            open={invOpen} onOpenChange={setInvOpen}
            poId={order.id} poNumber={order.po_number || "(No PO #)"}
            vendorNameStr={vendorName(order.vendor_id)}
            items={items} productName={productName} createdBy={currentUserId}
            poVendors={derivedVendorIds.map((id) => ({ id, name: vendorName(id) }))}
            itemVendorMap={itemVendorMap}
            existingInvoices={invoices.map((i) => ({
              invoice_number: i.invoice_number,
              invoice_amount: Number(i.invoice_amount || 0),
              vendor_id: i.vendor_id,
            }))}
            onSaved={() => { fetchSub(); onChanged(); }}
          />
        )}

      </DialogContent>
    </Dialog>
  );
}
