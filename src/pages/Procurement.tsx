import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useModuleConfig } from "@/hooks/useModuleConfig";
import { useProfilePermissions } from "@/hooks/useProfilePermissions";
import { Plus, Search, Trash2, X, ShoppingCart, Save, CalendarDays, ArrowRight } from "lucide-react";
import {
  PROC_STATUSES, USER_FORM_STATUSES,
  statusColor, fmtAmt, type ProcStatus, type SourceType,
} from "@/lib/procurement";
import { useUomOptions } from "@/hooks/useUomOptions";
import ProcurementDetail, { type DetailOrder } from "@/components/procurement/ProcurementDetail";
import ProductCombobox from "@/components/procurement/ProductCombobox";
import CategoryCombobox from "@/components/procurement/CategoryCombobox";
import UomComboInput from "@/components/procurement/UomComboInput";
import { fetchAddressOptions, formatAddressSnapshot, type AddressOption } from "@/lib/addresses";
import { useAppConfiguration } from "@/hooks/useAppConfiguration";
import { EditableListEditor } from "@/components/config/EditableListEditor";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import SalesforceImportDialog from "@/components/procurement/SalesforceImportDialog";
import SalesforceBulkImportDialog from "@/components/procurement/SalesforceBulkImportDialog";
import { LightningShell } from "@/components/procurement/lightning/LightningShell";
import { useUiMode, isLightning } from "@/hooks/useUiMode";
import { ClipboardList, Building2, FileText, Package, Wallet } from "lucide-react";
import ViewBar from "@/components/procurement/listviews/ViewBar";
import ViewEditorDialog, { type PickOption } from "@/components/procurement/listviews/ViewEditorDialog";
import ListViewTable from "@/components/procurement/listviews/ListViewTable";
import { useListViews } from "@/hooks/useListViews";
import { useIsMobile } from "@/hooks/use-mobile";
import { applyFilters, sortOrders, DEFAULT_VIEW_COLUMNS, type ListView } from "@/lib/procurementFields";

interface Vendor { id: string; name: string }
interface Site { id: string; site_name: string }
interface Category { id: string; category_name: string; sub_category_name?: string | null; terms_and_conditions?: string[] | null }
interface Product { id: string; product_name: string; default_uom: string | null; category_id?: string | null; category_name?: string | null; product_description?: string | null; code?: string | null; terms_and_conditions?: string[] | null }
interface LineItem { id?: string; product_id: string; category_id: string; rate: string; qty: string; uom: string; vendor_ids: string[] }

// Reusable vendor multi-select for line items (mirrors the one on the detail screen)
function LineVendorMultiSelect({
  vendors, selectedIds, onChange, placeholder = "Select vendors (optional)",
}: {
  vendors: { id: string; name: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-8 w-full justify-between font-normal text-xs">
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

const DRAFT_KEY = "procurement_requisition_draft";

const emptyForm = {
  source_type: "vendor" as SourceType,
  order_date: new Date().toISOString().slice(0, 10),
  requisition_name: "",
  vendor_ids: [] as string[],
  site_id: "",
  transfer_from_site_id: "",
  status: "Requisition" as ProcStatus,
  estimated_budget: "",
  requisition_notes: "",
  bill_to_id: "",
  ship_to_id: "",
  expected_payment_terms: "",
  expected_delivery_date: "",
  terms_and_conditions: [] as string[],
};

export default function Procurement() {
  const { profile, isAdmin } = useUserProfile();
  const { options: uomOptions, refetch: refetchUoms } = useUomOptions();
  const { hasPermission } = useProfilePermissions();
  const cfg = useModuleConfig("procurement");
  const cfgInternalTransfer = cfg.bool("internalTransfer");
  const cfgBudgetField = cfg.bool("budgetField");
  const cfgBillShipFields = cfg.bool("billShipFields");
  const cfgRequireNotes = cfg.bool("requireNotes");
  const cfgCanCreateRequisition = cfg.canDo("createRequisition");
  const canApprove = isAdmin || hasPermission("module_procurement", "edit");
  const appConfig = useAppConfiguration();
  const defaultTerms = (appConfig.getValue<string[]>("procurement", "termsAndConditions") ?? []) as string[];

  const [orders, setOrders] = useState<DetailOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<DetailOrder | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [uiMode] = useUiMode();
  const lightning = isLightning(uiMode);
  const [lines, setLines] = useState<LineItem[]>([{ product_id: "", category_id: "", rate: "", qty: "", uom: "", vendor_ids: [] }]);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailOrder | null>(null);
  const [sfImportOpen, setSfImportOpen] = useState(false);
  const [sfBulkOpen, setSfBulkOpen] = useState(false);
  const { hasAdminAccess } = useAdminAccess();
  const [addressOptions, setAddressOptions] = useState<AddressOption[]>([]);
  const [termsUserEdited, setTermsUserEdited] = useState(false);
  const [pendingUoms, setPendingUoms] = useState<string[]>([]);
  const [pendingUomChoices, setPendingUomChoices] = useState<Record<string, boolean>>({});

  // ---- Salesforce-style saved list views ----
  const {
    views, activeView, selectView, saveView, deleteView, pinDefault, userId: currentUserId,
  } = useListViews();
  const [viewEditorOpen, setViewEditorOpen] = useState(false);
  const [viewBeingEdited, setViewBeingEdited] = useState<ListView | null>(null);
  const [viewToDelete, setViewToDelete] = useState<ListView | null>(null);
  const isMobileView = useIsMobile();
  const [display, setDisplay] = useState<"cards" | "table">(
    () => (localStorage.getItem("procurement.listDisplay") as "cards" | "table") || "table"
  );
  useEffect(() => {
    if (localStorage.getItem("procurement.listDisplay")) return;
    setDisplay(isMobileView ? "cards" : "table");
  }, [isMobileView]);

  // Column sort (overrides the saved view sort until the view changes)
  const [sortOverride, setSortOverride] = useState<{ field: string; dir: "asc" | "desc" } | null>(null);
  useEffect(() => { setSortOverride(null); }, [activeView?.id]);
  const sortField = sortOverride?.field ?? activeView?.sort_field ?? null;
  const sortDir = sortOverride?.dir ?? activeView?.sort_dir ?? "desc";
  const toggleSort = (field: string) =>
    setSortOverride((prev) =>
      prev?.field === field ? { field, dir: prev.dir === "asc" ? "desc" : "asc" } : { field, dir: "asc" }
    );

  const [people, setPeople] = useState<PickOption[]>([]);
  useEffect(() => {
    supabase.from("profiles").select("id, full_name, username").then(({ data }) => {
      setPeople(((data || []) as any[]).map((p) => ({ value: p.id, label: p.full_name || p.username || p.id })));
    });
  }, []);
  const setDisplayMode = (d: "cards" | "table") => { setDisplay(d); localStorage.setItem("procurement.listDisplay", d); };

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [pendingRestore, setPendingRestore] = useState<null | {
    existingProductIds: string[]; existingCategoryIds: string[];
    pending: { type: "product" | "category" }; editingId: string | null;
  }>(null);

  useEffect(() => { fetchAddressOptions().then(setAddressOptions).catch(() => {}); }, []);
  const findAddr = (id: string) => addressOptions.find((a) => a.id === id) || null;


  useEffect(() => { fetchAll(); }, []);

  // Auto-merge Terms & Conditions from Material → Category → Generic whenever
  // line items change, unless the user has manually edited the term list.
  const mergedTerms = useMemo(() => {
    const productMap = new Map(products.map((p) => [p.id, p]));
    const categoryMap = new Map(categories.map((c) => [c.id, c]));
    const materialT: string[] = [];
    const categoryT: string[] = [];
    lines.forEach((l) => {
      const prod = productMap.get(l.product_id);
      if (prod?.terms_and_conditions?.length) materialT.push(...prod.terms_and_conditions);
      const cid = l.category_id || prod?.category_id || "";
      const cat = cid ? categoryMap.get(cid) : undefined;
      if (cat?.terms_and_conditions?.length) categoryT.push(...cat.terms_and_conditions);
    });
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (arr: string[]) => arr.forEach((t) => {
      const trimmed = (t || "").trim();
      if (!trimmed) return;
      const k = trimmed.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push(trimmed);
    });
    push(materialT);
    push(categoryT);
    push(defaultTerms);
    return out;
  }, [lines, products, categories, defaultTerms]);

  useEffect(() => {
    if (termsUserEdited) return;
    if (!isFormOpen) return;
    setForm((p) => ({ ...p, terms_and_conditions: mergedTerms }));
  }, [mergedTerms, termsUserEdited, isFormOpen]);


  // Restore an in-progress requisition after returning from a master screen.
  useEffect(() => {
    let draft: any = null;
    try { draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null"); } catch { /* ignore */ }
    if (!draft) return;
    sessionStorage.removeItem(DRAFT_KEY);
    setForm(draft.form);
    setLines(draft.lines);
    setIsFormOpen(true);
    setPendingRestore({
      existingProductIds: draft.existingProductIds || [],
      existingCategoryIds: draft.existingCategoryIds || [],
      pending: draft.pending,
      editingId: draft.editingId ?? null,
    });
  }, []);

  // Once master data is refreshed, auto-select the newly created Product/Category.
  useEffect(() => {
    if (!pendingRestore || isLoading) return;
    if (pendingRestore.editingId) {
      const o = orders.find((x) => x.id === pendingRestore.editingId);
      if (o) setEditing(o);
    }
    if (pendingRestore.pending.type === "product") {
      const newProd = products.find((p) => !pendingRestore.existingProductIds.includes(p.id));
      if (newProd) {
        setLines((prev) => {
          const idx = prev.findIndex((l) => !l.product_id);
          const t = idx === -1 ? prev.length - 1 : idx;
          return prev.map((l, i) => i === t ? { ...l, product_id: newProd.id, category_id: newProd.category_id || l.category_id, uom: l.uom || newProd.default_uom || "" } : l);
        });
        toast.success(`"${newProd.product_name}" added and selected`);
      }
    } else {
      const newCat = categories.find((c) => !pendingRestore.existingCategoryIds.includes(c.id));
      if (newCat) {
        setLines((prev) => {
          const idx = prev.findIndex((l) => !l.category_id);
          const t = idx === -1 ? prev.length - 1 : idx;
          return prev.map((l, i) => i === t ? { ...l, category_id: newCat.id } : l);
        });
        toast.success(`"${newCat.category_name}" added and selected`);
      }
    }
    setPendingRestore(null);
  }, [pendingRestore, isLoading, products, categories, orders]);

  // Focus target when navigated from a deep link (e.g., Vendor 360°)
  const [detailFocus, setDetailFocus] = useState<{ vendorId?: string | null; section?: "quote" | "invoices" | "grns" | "financials"; invoiceId?: string | null } | null>(null);

  // Where to go when the detail closes, when the caller asked for one. A report
  // row sets ?from=/analytics?tab=payments so closing the PO returns to that
  // report rather than stranding the user on the procurement list they never
  // chose to visit.
  const [returnTo, setReturnTo] = useState<string | null>(null);

  // Open detail when navigated with ?po=<id>&vendor=&section=&invoice=&from=
  useEffect(() => {
    const poId = searchParams.get("po");
    if (poId && orders.length) {
      const found = orders.find((o) => o.id === poId);
      if (found) {
        const vendorId = searchParams.get("vendor");
        const section = searchParams.get("section") as any;
        const invoiceId = searchParams.get("invoice");
        const from = searchParams.get("from");
        // Same-origin in-app paths only — never follow an absolute URL from a
        // query string.
        setReturnTo(from && from.startsWith("/") && !from.startsWith("//") ? from : null);
        setDetailFocus({
          vendorId: vendorId || null,
          section: (["quote", "invoices", "grns", "financials"].includes(section) ? section : undefined),
          invoiceId: invoiceId || null,
        });
        setDetail(found);
        setSearchParams((prev) => { prev.delete("po"); prev.delete("vendor"); prev.delete("section"); prev.delete("invoice"); prev.delete("from"); return prev; }, { replace: true });
      }
    }
  }, [searchParams, orders]);

  const fetchAll = async () => {
    setIsLoading(true);
    const [ord, ven, sit, prod, cat] = await Promise.all([
      supabase.from("procurement_orders").select("*, procurement_items(*)").order("created_at", { ascending: false, nullsFirst: false }),
      supabase.from("vendors").select("id, name").order("name"),
      supabase.from("project_sites").select("id, site_name").is("deleted_at", null).order("site_name"),
      supabase.from("master_products").select("id, product_name, default_uom, category_id, product_description, terms_and_conditions, master_categories(category_name)").eq("is_active", true).order("product_name"),
      supabase.from("master_categories").select("id, category_name, sub_category_name, terms_and_conditions").eq("is_active", true).order("category_name"),
    ]);
    setOrders((ord.data || []) as DetailOrder[]);
    setVendors((ven.data || []) as Vendor[]);
    setSites((sit.data || []) as Site[]);
    setProducts(((prod.data || []) as any[]).map((p) => ({
      id: p.id,
      product_name: p.product_name,
      default_uom: p.default_uom,
      category_id: p.category_id ?? null,
      product_description: p.product_description,
      category_name: p.master_categories?.category_name ?? null,
      terms_and_conditions: Array.isArray(p.terms_and_conditions) ? p.terms_and_conditions : null,
    })) as Product[]);
    setCategories((cat.data || []) as Category[]);

    // Load requisition owner names
    const ownerIds = Array.from(new Set(((ord.data || []) as any[]).map((o) => o.created_by).filter(Boolean)));
    if (ownerIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, username").in("id", ownerIds);
      const map: Record<string, string> = {};
      (profs || []).forEach((p: any) => { map[p.id] = p.full_name || p.username || "—"; });
      setOwnerNames(map);
    } else {
      setOwnerNames({});
    }

    setIsLoading(false);
    // keep open detail fresh
    setDetail((d) => (d ? ((ord.data || []) as DetailOrder[]).find((o) => o.id === d.id) || null : null));
  };

  const vName = (id: string | null) => vendors.find((v) => v.id === id)?.name || "—";
  const sName = (id: string | null) => sites.find((s) => s.id === id)?.site_name || "—";
  const pName = (id: string | null) => products.find((p) => p.id === id)?.product_name || "—";

  const lineTotal = useMemo(
    () => lines.reduce((sum, l) => sum + (parseFloat(l.rate) || 0) * (parseFloat(l.qty) || 0), 0),
    [lines]
  );

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm, terms_and_conditions: defaultTerms });
    setLines([{ product_id: "", category_id: "", rate: "", qty: "", uom: "", vendor_ids: [] }]);
    setTermsUserEdited(false);
    setIsFormOpen(true);
  };

  const openEdit = (o: DetailOrder) => {
    setDetail(null);
    setEditing(o);
    setForm({
      source_type: (o.source_type === "internal_transfer" ? "internal_transfer" : "vendor") as SourceType,
      order_date: o.order_date,
      requisition_name: (o as any).requisition_name || "",
      vendor_ids: o.vendor_ids && o.vendor_ids.length ? o.vendor_ids : (o.vendor_id ? [o.vendor_id] : []),
      site_id: o.site_id || "",
      transfer_from_site_id: o.transfer_from_site_id || "",
      status: (USER_FORM_STATUSES.includes(o.status as ProcStatus) ? o.status : "Requisition") as ProcStatus,
      estimated_budget: o.estimated_budget != null ? String(o.estimated_budget) : "",
      requisition_notes: o.requisition_notes || "",
      bill_to_id: o.bill_to_address_id || "",
      ship_to_id: o.ship_to_address_id || "",
      expected_payment_terms: (o as any).payment_terms || "",
      expected_delivery_date: (o as any).expected_delivery_date || "",
      terms_and_conditions: Array.isArray((o as any).terms_and_conditions) ? (o as any).terms_and_conditions : defaultTerms,
    });
    const items = (o.procurement_items || []).map((it) => ({
      id: it.id, product_id: it.product_id || "",
      category_id: products.find((p) => p.id === it.product_id)?.category_id || "",
      rate: String(it.rate ?? ""), qty: String(it.qty ?? ""), uom: it.uom || "",
      vendor_ids: Array.isArray(it.vendor_ids) ? it.vendor_ids : [],
    }));
    setLines(items.length ? items : [{ product_id: "", category_id: "", rate: "", qty: "", uom: "", vendor_ids: [] }]);
    // When editing, treat the persisted list as user-authored so we don't overwrite it.
    setTermsUserEdited(true);
    setIsFormOpen(true);
  };

  const updateLine = (i: number, patch: Partial<LineItem>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const onProductChange = (i: number, productId: string) => {
    const prod = products.find((p) => p.id === productId);
    const def = prod?.default_uom || "";
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, product_id: productId, category_id: prod?.category_id || l.category_id, uom: l.uom || def } : l)));
  };
  const onCategoryChange = (i: number, categoryId: string) => {
    setLines((prev) => prev.map((l, idx) => {
      if (idx !== i) return l;
      // Clear the product if it no longer belongs to the chosen category.
      const prod = products.find((p) => p.id === l.product_id);
      const keepProduct = prod && prod.category_id === categoryId;
      return { ...l, category_id: categoryId, product_id: keepProduct ? l.product_id : "" };
    }));
  };
  const addLine = () => setLines((prev) => [...prev, { product_id: "", category_id: "", rate: "", qty: "", uom: "", vendor_ids: [] }]);
  const removeLine = (i: number) =>
    setLines((prev) => (prev.length <= 1 ? [{ product_id: "", category_id: "", rate: "", qty: "", uom: "", vendor_ids: [] }] : prev.filter((_, idx) => idx !== i)));

  // Persist the in-progress requisition and jump to a master screen to add a new
  // Product/Category, then return to this exact form (see restore effect on mount).
  const quickAdd = (type: "product" | "category") => {
    const draft = {
      form, lines, editingId: editing?.id ?? null,
      existingProductIds: products.map((p) => p.id),
      existingCategoryIds: categories.map((c) => c.id),
      pending: { type },
    };
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* ignore */ }
    navigate(type === "product" ? "/master-data/products?returnTo=/procurement" : "/master-data/categories?returnTo=/procurement");
  };

  const handleSave = async () => {
    const isTransfer = form.source_type === "internal_transfer";
    const validLines = lines.filter((l) => l.product_id && (parseFloat(l.qty) || 0) > 0);
    if (!form.requisition_name.trim()) { toast.error("Requisition name is required"); return; }
    if (validLines.length === 0) { toast.error("Add at least one product line item"); return; }
    if (cfgRequireNotes && !form.requisition_notes.trim()) { toast.error("Notes / reason is required"); return; }
    if (isTransfer) {
      if (!form.transfer_from_site_id) { toast.error("Select the site the material is transferred from"); return; }
      if (!form.site_id) { toast.error("Select the destination site"); return; }
      if (form.transfer_from_site_id === form.site_id) { toast.error("Transfer From and Transfer To sites must differ"); return; }
    }
    setIsSaving(true);
    try {
      const billAddr = !isTransfer && form.bill_to_id ? findAddr(form.bill_to_id) : null;
      const shipAddr = !isTransfer && form.ship_to_id ? findAddr(form.ship_to_id) : null;
      // Derive PO-level vendor list from the per-line vendor assignments
      const derivedVendorIds = Array.from(new Set(validLines.flatMap((l) => l.vendor_ids || [])));
      const orderPayload = {
        source_type: form.source_type,
        order_date: form.order_date,
        requisition_name: form.requisition_name.trim() || null,
        vendor_id: isTransfer ? null : (derivedVendorIds[0] || null),
        vendor_ids: isTransfer ? null : (derivedVendorIds.length ? derivedVendorIds : null),
        site_id: form.site_id || null,
        transfer_from_site_id: isTransfer ? (form.transfer_from_site_id || null) : null,
        status: form.status,
        estimated_budget: !isTransfer && form.estimated_budget ? parseFloat(form.estimated_budget) : null,
        requisition_notes: form.requisition_notes.trim() || null,
        bill_to: billAddr ? formatAddressSnapshot(billAddr) : null,
        ship_to: shipAddr ? formatAddressSnapshot(shipAddr) : null,
        bill_to_address_id: isTransfer ? null : (form.bill_to_id || null),
        ship_to_address_id: isTransfer ? null : (form.ship_to_id || null),
        bill_to_gst: billAddr?.gst_number || null,
        ship_to_gst: shipAddr?.gst_number || null,
        total_amount: isTransfer ? 0 : lineTotal,
        payment_terms: !isTransfer && form.expected_payment_terms.trim() ? form.expected_payment_terms.trim() : null,
        expected_delivery_date: !isTransfer && form.expected_delivery_date ? form.expected_delivery_date : null,
        terms_and_conditions: isTransfer ? null : (form.terms_and_conditions.filter((t) => t.trim().length > 0)),
      };


      let orderId = editing?.id;
      if (editing) {
        const { error } = await supabase.from("procurement_orders").update(orderPayload).eq("id", editing.id);
        if (error) throw error;
        const { error: delErr } = await supabase.from("procurement_items").delete().eq("procurement_id", editing.id);
        if (delErr) throw delErr;
      } else {
        const { data, error } = await supabase
          .from("procurement_orders")
          .insert({ ...orderPayload, created_by: profile?.id })
          .select("id")
          .single();
        if (error) throw error;
        orderId = data.id;
      }

      const itemRows = validLines.map((l) => {
        const rate = isTransfer ? 0 : (parseFloat(l.rate) || 0);
        const qty = parseFloat(l.qty) || 0;
        return {
          procurement_id: orderId, product_id: l.product_id, rate, qty, amount: rate * qty,
          uom: l.uom || null,
          vendor_ids: isTransfer ? [] : (l.vendor_ids || []),
        };
      });
      const { error: itemErr } = await supabase.from("procurement_items").insert(itemRows);
      if (itemErr) throw itemErr;

      toast.success(editing ? "Saved" : (isTransfer ? "Internal transfer created" : "Procurement created"));
      // Prompt to save any typed-in UOMs that aren't in the master
      const knownUom = new Set(uomOptions.map((u) => u.toLowerCase()));
      const custom = Array.from(new Set(
        validLines
          .map((l) => (l.uom || "").trim())
          .filter((u) => u && !knownUom.has(u.toLowerCase()))
      ));
      if (custom.length) {
        setPendingUomChoices(Object.fromEntries(custom.map((u) => [u, true])));
        setPendingUoms(custom);
      }
      setIsFormOpen(false);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const persistCustomUoms = async () => {
    const toSave = pendingUoms.filter((u) => pendingUomChoices[u]);
    if (!toSave.length) { setPendingUoms([]); return; }
    const rows = toSave.map((u) => ({ uom_name: u, is_active: true, created_by: profile?.id ?? null }));
    const { error } = await supabase.from("master_uom").insert(rows);
    if (error) toast.error(error.message || "Could not save UOMs");
    else {
      toast.success(`${toSave.length} UOM${toSave.length > 1 ? "s" : ""} added to master`);
      refetchUoms();
    }
    setPendingUoms([]);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("procurement_orders").delete().eq("id", id);
    if (error) toast.error(error.message || "Failed to delete");
    else { toast.success("Procurement deleted"); fetchAll(); }
    setDeleteId(null);
  };

  const vendorNameById = useMemo(
    () => Object.fromEntries(vendors.map((v) => [v.id, v.name])) as Record<string, string>,
    [vendors]
  );

  const filtered = useMemo(() => {
    let list = orders;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (o) => {
          const vIds: string[] = ((o as any).vendor_ids as string[] | null) || ((o as any).vendor_id ? [(o as any).vendor_id] : []);
          const vendorNames = vIds.map((id) => vendorNameById[id] || "").join(" ").toLowerCase();
          return (
            (o.po_number || "").toLowerCase().includes(q) ||
            ((o as any).requisition_number || "").toLowerCase().includes(q) ||
            ((o as any).requisition_name || "").toLowerCase().includes(q) ||
            sName(o.site_id).toLowerCase().includes(q) ||
            (ownerNames[o.created_by || ""] || "").toLowerCase().includes(q) ||
            vendorNames.includes(q)
          );
        }
      );
    }
    if (filterStatus !== "all") list = list.filter((o) => o.status === filterStatus);
    if (activeView) list = applyFilters(list, activeView.filters);
    if (sortField) list = sortOrders(list, sortField, sortDir);
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, search, filterStatus, sites, ownerNames, vendorNameById, activeView, sortField, sortDir]);

  const siteOptions: PickOption[] = useMemo(() => sites.map((s) => ({ value: s.id, label: s.site_name })), [sites]);
  const vendorOptions: PickOption[] = useMemo(() => vendors.map((v) => ({ value: v.id, label: v.name })), [vendors]);
  const ownerOptions: PickOption[] = people;
  const activeColumns = activeView?.columns?.length ? activeView.columns : DEFAULT_VIEW_COLUMNS;


  const fmtDMY = (d?: string | null) => {
    if (!d) return "—";
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${dt.getFullYear()}`;
  };

  return (
    <LightningShell>
    <motion.div className="space-y-4 py-4 px-4 sm:px-6 lg:px-8 pb-24 w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><ShoppingCart className="h-5 w-5" />Procurement</h1>
          <p className="text-xs text-muted-foreground">{orders.length} requisitions</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hasAdminAccess && (
            <Button size="sm" variant="outline" onClick={() => setSfImportOpen(true)} className="gap-1.5">
              Import from Salesforce
            </Button>
          )}
          {hasAdminAccess && (
            <Button size="sm" variant="outline" onClick={() => setSfBulkOpen(true)} className="gap-1.5">
              Bulk Import (SF)
            </Button>
          )}
          {cfgCanCreateRequisition && <Button size="sm" onClick={openAdd} className="gap-1.5"><Plus className="h-4 w-4" />New Requisition</Button>}
        </div>
      </div>


      <SalesforceImportDialog open={sfImportOpen} onOpenChange={setSfImportOpen} onImported={fetchAll} />
      <SalesforceBulkImportDialog open={sfBulkOpen} onOpenChange={setSfBulkOpen} onImported={fetchAll} />

      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search REQ #, name, PO, site, owner, vendor..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {PROC_STATUSES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      <ViewBar
        views={views}
        activeView={activeView}
        currentUserId={currentUserId}
        onSelect={selectView}
        onNew={() => { setViewBeingEdited(null); setViewEditorOpen(true); }}
        onEdit={(v) => { setViewBeingEdited(v); setViewEditorOpen(true); }}
        onDelete={(v) => setViewToDelete(v)}
        onPin={(v) => pinDefault(v ? v.id : null)}
        onClone={(v) => {
          setViewBeingEdited({ ...v, id: "", name: `${v.name} -Copy`, is_default: false });
          setViewEditorOpen(true);
        }}
        display={display}
        onDisplayChange={setDisplayMode}
        count={filtered.length}
      />

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">
          {orders.length === 0 ? "No procurement orders yet." : "No orders match your search/filter."}
        </CardContent></Card>
      ) : display === "table" ? (
        <ListViewTable
          rows={filtered}
          columns={activeColumns}
          siteOptions={siteOptions}
          vendorOptions={vendorOptions}
          ownerOptions={ownerOptions}
          onOpen={(row) => setDetail(row as DetailOrder)}
          onSaved={fetchAll}
          sortField={sortField}
          sortDir={sortDir}
          onSort={toggleSort}
        />
      ) : (
        <div className="space-y-2">

          {filtered.map((o) => {
            const isTransfer = o.source_type === "internal_transfer";
            const reqNo = (o as any).requisition_number || "—";
            const reqName = (o as any).requisition_name || "";
            const owner = ownerNames[o.created_by || ""] || "—";
            return (
            <Card key={o.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDetail(o)}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-sm truncate">{reqNo}</h3>
                      {isTransfer && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">Internal Transfer</Badge>
                      )}
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusColor(o.status)}`}>{o.status}</Badge>
                    </div>
                    {reqName && (
                      <p className="text-xs font-medium text-foreground/80 truncate mb-0.5">{reqName}</p>
                    )}
                    <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                      <CalendarDays className="h-3 w-3" />{fmtDMY(o.order_date)}
                      <span className="opacity-50">·</span>
                      <span className="truncate">Owner: {owner}</span>
                    </p>
                    {isTransfer ? (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate flex items-center gap-1 flex-wrap">
                        Site: {sName(o.transfer_from_site_id)} <ArrowRight className="h-3 w-3" /> {sName(o.site_id)}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        Site: {sName(o.site_id)}
                        {o.po_number && <span className="ml-1 opacity-70">· PO: {o.po_number}</span>}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {!isTransfer && <div className="font-semibold text-sm">{fmtAmt(o.total_amount || 0)}</div>}
                    <div className="text-[10px] text-muted-foreground">{o.procurement_items?.length || 0} items</div>
                    {canApprove && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 mt-1 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteId(o.id); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      <ViewEditorDialog
        open={viewEditorOpen}
        onOpenChange={setViewEditorOpen}
        view={viewBeingEdited}
        onSave={(v) => saveView(v)}
        siteOptions={siteOptions}
        vendorOptions={vendorOptions}
        ownerOptions={ownerOptions}
        people={people}
      />

      <AlertDialog open={!!viewToDelete} onOpenChange={(o) => !o && setViewToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete list view?</AlertDialogTitle>
            <AlertDialogDescription>
              "{viewToDelete?.name}" will be removed for everyone it is shared with. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (viewToDelete) deleteView(viewToDelete.id); setViewToDelete(null); }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create/Edit Form — Salesforce Lightning styled */}

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className={`sf-form max-w-none w-screen h-screen sm:rounded-none p-0 gap-0 flex flex-col ${lightning ? "lightning-ui" : ""}`}>
          <DialogHeader className={`px-4 sm:px-6 py-3 border-b shrink-0 ${lightning ? "bg-white" : ""}`}>
            <div className="flex items-center gap-3">
              {lightning && (
                <div className="sf-object-icon shrink-0"><ClipboardList className="h-5 w-5" /></div>
              )}
              <div className="min-w-0 flex-1">
                {lightning && <div className="sf-eyebrow">Procurement</div>}
                <DialogTitle className={lightning ? "sf-title" : ""}>
                  {editing ? "Edit Requisition" : "New Requisition"}
                </DialogTitle>
                {lightning && (
                  <div className="sf-subtitle">
                    {form.source_type === "internal_transfer" ? "Internal site-to-site material transfer" : "Vendor purchase requisition"}
                  </div>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className={`overflow-y-auto flex-1 w-full ${lightning ? "bg-[var(--sf-surface-shell,#f3f2f2)]" : ""}`}>
            <div className="w-full px-2 sm:px-3 py-4 sm:py-6 space-y-4">

              {/* Source Type selector — SLDS segmented control */}
              {cfgInternalTransfer && (
                <section className="sf-card rounded-md border bg-card">
                  <div className="px-4 sm:px-5 py-3 border-b">
                    <h2 className="text-sm font-semibold">Source Type</h2>
                  </div>
                  <div className="p-4 sm:p-5">
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { v: "vendor", label: "Vendor Purchase", icon: <Building2 className="h-4 w-4" /> },
                        { v: "internal_transfer", label: "Internal Transfer", icon: <Package className="h-4 w-4" /> },
                      ] as const).map((opt) => {
                        const active = form.source_type === opt.v;
                        return (
                          <button
                            key={opt.v}
                            type="button"
                            onClick={() => setForm((p) => ({ ...p, source_type: opt.v as SourceType }))}
                            className={`inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium transition-colors ${
                              active
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background text-foreground border-input hover:bg-muted"
                            }`}
                          >
                            {opt.icon}
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {form.source_type === "internal_transfer"
                        ? <>Once approved by an admin, the destination site can confirm goods received. No vendor, PO or payment involved.</>
                        : <>Once approved by an admin, PO Number, Bill/Ship To, delivery date, payment terms and rates become available on the PO detail screen.</>}
                    </p>
                  </div>
                </section>
              )}

              {/* Requisition Information */}
              <section className="sf-card rounded-md border bg-card">
                <div className="px-4 sm:px-5 py-3 border-b flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">Requisition Information</h2>
                </div>
                <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                  {/* Row 1: Requisition Name | Requested By */}
                  <div>
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Requisition Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={form.requisition_name}
                      onChange={(e) => setForm((p) => ({ ...p, requisition_name: e.target.value }))}
                      placeholder={form.source_type === "internal_transfer" ? "e.g. Steel transfer — Bharath Mall to Fiza Nexus" : "e.g. Cement for Ground Floor slab"}
                      className="h-9 mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Requested By</Label>
                    <Input value={profile?.full_name || profile?.username || ""} readOnly disabled className="h-9 mt-1 bg-muted/50" />
                  </div>

                  {/* Row 2: Requisition Date | Site */}
                  <div>
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Requisition Date</Label>
                    <Input type="date" value={form.order_date} onChange={(e) => setForm((p) => ({ ...p, order_date: e.target.value }))} className="h-9 mt-1" />
                  </div>
                  {form.source_type === "internal_transfer" ? (
                    <div>
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Transfer From Site</Label>
                      <Select value={form.transfer_from_site_id} onValueChange={(v) => setForm((p) => ({ ...p, transfer_from_site_id: v }))}>
                        <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Source site giving material" /></SelectTrigger>
                        <SelectContent>{sites.map((s) => (<SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>))}</SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div>
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Site</Label>
                      <Select value={form.site_id} onValueChange={(v) => setForm((p) => ({ ...p, site_id: v }))}>
                        <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select site" /></SelectTrigger>
                        <SelectContent>{sites.map((s) => (<SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>))}</SelectContent>
                      </Select>
                    </div>
                  )}

                  {form.source_type === "internal_transfer" && (
                    <div className="md:col-span-2">
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Transfer To Site</Label>
                      <Select value={form.site_id} onValueChange={(v) => setForm((p) => ({ ...p, site_id: v }))}>
                        <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Destination site receiving material" /></SelectTrigger>
                        <SelectContent>{sites.map((s) => (<SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>))}</SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Row 3: Bill To | Ship To — vendor purchase only */}
                  {form.source_type !== "internal_transfer" && cfgBillShipFields && (
                    <>
                      <div>
                        <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bill To</Label>
                        <Select value={form.bill_to_id} onValueChange={(v) => setForm((p) => ({ ...p, bill_to_id: v }))}>
                          <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select billing address" /></SelectTrigger>
                          <SelectContent>{addressOptions.map((a) => (<SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>))}</SelectContent>
                        </Select>
                        {(() => {
                          const a = form.bill_to_id ? findAddr(form.bill_to_id) : null;
                          return a ? (
                            <div className="mt-2 rounded-md border bg-muted/40 p-2.5 text-xs whitespace-pre-wrap text-muted-foreground">
                              {formatAddressSnapshot(a)}
                              {a.gst_number && <div className="mt-1 font-medium text-foreground">GST: {a.gst_number}</div>}
                            </div>
                          ) : null;
                        })()}
                      </div>
                      <div>
                        <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ship To</Label>
                        <Select value={form.ship_to_id} onValueChange={(v) => setForm((p) => ({ ...p, ship_to_id: v }))}>
                          <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select delivery address" /></SelectTrigger>
                          <SelectContent>{addressOptions.map((a) => (<SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>))}</SelectContent>
                        </Select>
                        {(() => {
                          const a = form.ship_to_id ? findAddr(form.ship_to_id) : null;
                          return a ? (
                            <div className="mt-2 rounded-md border bg-muted/40 p-2.5 text-xs whitespace-pre-wrap text-muted-foreground">
                              {formatAddressSnapshot(a)}
                              {a.gst_number && <div className="mt-1 font-medium text-foreground">GST: {a.gst_number}</div>}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    </>
                  )}

                  {/* Row 4: Expected Delivery Date | Payment Terms — vendor purchase only */}
                  {form.source_type !== "internal_transfer" && (
                    <>
                      <div>
                        <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Expected Delivery Date</Label>
                        <Input
                          type="date"
                          value={form.expected_delivery_date}
                          onChange={(e) => setForm((p) => ({ ...p, expected_delivery_date: e.target.value }))}
                          className="h-9 mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Payment Terms</Label>
                        <Input
                          value={form.expected_payment_terms}
                          onChange={(e) => setForm((p) => ({ ...p, expected_payment_terms: e.target.value }))}
                          placeholder="e.g. Net 30, Advance 50%"
                          className="h-9 mt-1"
                        />
                      </div>
                    </>
                  )}

                  {/* Estimated Budget — optional per config */}
                  {form.source_type !== "internal_transfer" && cfgBudgetField && (
                    <div className="md:col-span-2">
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Estimated Budget (₹)</Label>
                      <Input type="number" inputMode="decimal" value={form.estimated_budget} onChange={(e) => setForm((p) => ({ ...p, estimated_budget: e.target.value }))} placeholder="0" className="h-9 mt-1" />
                    </div>
                  )}

                  {/* Row 5: Notes — full width */}
                  <div className="md:col-span-2">
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {form.source_type === "internal_transfer" ? "Notes / Reason for Transfer" : "Notes / Reason for Requisition"}
                      {cfgRequireNotes ? " *" : ""}
                    </Label>
                    <Textarea
                      value={form.requisition_notes}
                      onChange={(e) => setForm((p) => ({ ...p, requisition_notes: e.target.value }))}
                      placeholder={form.source_type === "internal_transfer" ? "Why is this material being transferred?" : "Why is this material needed?"}
                      className="min-h-[80px] mt-1"
                    />
                  </div>
                </div>
              </section>


              {/* Line items */}
              <section className="sf-card rounded-md border bg-card">
                <div className="px-4 sm:px-5 py-3 border-b flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold">Product Line Items</h2>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{lines.length}</Badge>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addLine}>
                    <Plus className="h-3.5 w-3.5" />Add Item
                  </Button>
                </div>
                <div className="p-4 sm:p-5 space-y-3">
                  <p className="text-[11px] text-muted-foreground">
                    {form.source_type === "internal_transfer"
                      ? "Enter material, unit and quantity to transfer. No rates — internal transfers involve no money."
                      : "Enter material, unit and quantity. Rates are added after the requisition is approved."}
                  </p>
                  {lines.length === 0 && (
                    <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                      No line items yet. Click <span className="font-medium">Add Item</span> to get started.
                    </div>
                  )}
                  {lines.map((l, i) => (
                    <div key={i} className="rounded-md border bg-background p-3 sm:p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Item {i + 1}</div>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeLine(i)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Category</Label>
                          <div className="mt-1">
                            <CategoryCombobox
                              categories={categories}
                              value={l.category_id}
                              onChange={(v) => onCategoryChange(i, v)}
                              onAddNew={() => quickAdd("category")}
                              addNewLabel="Add Category"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Material</Label>
                          <div className="mt-1">
                            <ProductCombobox
                              products={products}
                              categoryId={l.category_id || undefined}
                              value={l.product_id}
                              onChange={(v) => onProductChange(i, v)}
                              onAddNew={() => quickAdd("product")}
                              addNewLabel="Add Product"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">UOM</Label>
                          <div className="mt-1">
                            <UomComboInput
                              options={uomOptions}
                              value={l.uom}
                              onChange={(v) => updateLine(i, { uom: v })}
                              placeholder="Type or select UOM"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Quantity</Label>
                          <Input type="number" inputMode="decimal" value={l.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} placeholder="0" className="h-9 mt-1" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Terms & Conditions — vendor purchase only, at the very end */}
              {form.source_type !== "internal_transfer" && (
                <section className="sf-card rounded-md border bg-card">
                  <div className="px-4 sm:px-5 py-3 border-b flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold">Terms &amp; Conditions</h2>
                  </div>
                  <div className="p-4 sm:p-5">
                    <p className="text-[11px] text-muted-foreground mb-2">Auto-populated in order: Material-wise → Category-wise → Generic (from Admin → Configuration). Add or remove terms as needed before submitting.</p>
                    <EditableListEditor
                      items={form.terms_and_conditions}
                      onChange={(next) => { setTermsUserEdited(true); setForm((p) => ({ ...p, terms_and_conditions: next })); }}
                      placeholder="Add a term (e.g. Payment on receipt of goods)"
                    />
                    {termsUserEdited && (
                      <button
                        type="button"
                        onClick={() => { setTermsUserEdited(false); setForm((p) => ({ ...p, terms_and_conditions: mergedTerms })); }}
                        className="mt-2 text-[11px] text-primary hover:underline"
                      >
                        Reset to auto-populated terms
                      </button>
                    )}
                  </div>
                </section>
              )}

              <div className="h-2" />

            </div>
          </div>

          {/* Sticky footer action bar — SLDS style */}
          <div className={`shrink-0 border-t px-4 sm:px-6 py-3 flex items-center justify-end gap-2 ${lightning ? "bg-white" : "bg-background"}`}>
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? "Saving..." : editing ? "Save Changes" : "Create Requisition"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      {/* Detail */}
      {detail && (
        <ProcurementDetail
          open={!!detail}
          onOpenChange={(o) => {
            if (!o) {
              setDetail(null);
              setDetailFocus(null);
              if (returnTo) { const back = returnTo; setReturnTo(null); navigate(back); }
            }
          }}
          order={detail}
          canApprove={canApprove}
          currentUserId={profile?.id}
          vendorName={vName}
          siteName={sName}
          productName={pName}
          onEdit={openEdit}
          onChanged={fetchAll}
          focus={detailFocus}
          onFocusConsumed={() => setDetailFocus((f) => f ? { ...f, invoiceId: null } : f)}
        />
      )}

      {/* Delete confirm */}
      <Sheet open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader><SheetTitle>Delete Procurement Order?</SheetTitle></SheetHeader>
          <p className="text-sm text-muted-foreground mt-2">This will permanently remove the order and its line items.</p>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" className="flex-1" onClick={() => deleteId && handleDelete(deleteId)}>Delete</Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Prompt to save typed-in UOMs to master */}
      <AlertDialog open={pendingUoms.length > 0} onOpenChange={(o) => !o && setPendingUoms([])}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save new UOM to master?</AlertDialogTitle>
            <AlertDialogDescription>
              These units of measurement aren't in the UOM Master yet. Select which ones to save for future requisitions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2 max-h-60 overflow-y-auto">
            {pendingUoms.map((u) => (
              <label key={u} className="flex items-center gap-2 text-sm cursor-pointer rounded-md border p-2 hover:bg-muted/50">
                <Checkbox
                  checked={!!pendingUomChoices[u]}
                  onCheckedChange={(c) => setPendingUomChoices((prev) => ({ ...prev, [u]: !!c }))}
                />
                <span className="font-medium">{u}</span>
              </label>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingUoms([])}>Skip</AlertDialogCancel>
            <AlertDialogAction onClick={persistCustomUoms}>Save selected</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
    </LightningShell>
  );
}
