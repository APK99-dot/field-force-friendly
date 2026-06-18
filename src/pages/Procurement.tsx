import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Plus, Search, Trash2, X, ShoppingCart, Save, CalendarDays, FileText, Truck } from "lucide-react";

const STATUSES = [
  "Draft", "Submitted", "Approved", "PO Issued",
  "Partially Received", "Received", "Closed", "Rejected", "Cancelled",
] as const;
type ProcStatus = (typeof STATUSES)[number];

interface Vendor { id: string; name: string }
interface Site { id: string; site_name: string }
interface Entity { id: string; entity_name: string }
interface Product { id: string; product_name: string }

interface LineItem { id?: string; product_id: string; rate: string; qty: string }

interface ProcItem { id: string; product_id: string | null; rate: number; qty: number; amount: number }
interface ProcOrder {
  id: string;
  order_date: string;
  vendor_id: string | null;
  po_number: string | null;
  site_id: string | null;
  entity_id: string | null;
  status: string;
  grn_number: string | null;
  grn_status: string | null;
  total_amount: number;
  procurement_items?: ProcItem[];
}

const emptyForm = {
  order_date: new Date().toISOString().slice(0, 10),
  vendor_id: "",
  po_number: "",
  site_id: "",
  entity_id: "",
  status: "Draft" as ProcStatus,
  grn_number: "",
  grn_status: "",
};

function statusColor(status: string) {
  switch (status) {
    case "Draft": return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
    case "Submitted": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "Approved": return "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400";
    case "PO Issued": return "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400";
    case "Partially Received": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    case "Received": return "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400";
    case "Closed": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "Rejected": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "Cancelled": return "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400";
    default: return "";
  }
}

const fmtAmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Procurement() {
  const { profile, isAdmin } = useUserProfile();
  const [orders, setOrders] = useState<ProcOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProcOrder | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [lines, setLines] = useState<LineItem[]>([{ product_id: "", rate: "", qty: "" }]);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setIsLoading(true);
    const [ord, ven, sit, ent, prod] = await Promise.all([
      supabase.from("procurement_orders").select("*, procurement_items(*)").order("order_date", { ascending: false }),
      supabase.from("vendors").select("id, name").order("name"),
      supabase.from("project_sites").select("id, site_name").is("deleted_at", null).order("site_name"),
      supabase.from("master_entities").select("id, entity_name").eq("is_active", true).order("entity_name"),
      supabase.from("master_products").select("id, product_name").eq("is_active", true).order("product_name"),
    ]);
    setOrders((ord.data || []) as ProcOrder[]);
    setVendors((ven.data || []) as Vendor[]);
    setSites((sit.data || []) as Site[]);
    setEntities((ent.data || []) as Entity[]);
    setProducts((prod.data || []) as Product[]);
    setIsLoading(false);
  };

  const vName = (id: string | null) => vendors.find((v) => v.id === id)?.name || "—";
  const sName = (id: string | null) => sites.find((s) => s.id === id)?.site_name || "—";
  const eName = (id: string | null) => entities.find((e) => e.id === id)?.entity_name || "—";
  const pName = (id: string | null) => products.find((p) => p.id === id)?.product_name || "—";

  const lineTotal = useMemo(
    () => lines.reduce((sum, l) => sum + (parseFloat(l.rate) || 0) * (parseFloat(l.qty) || 0), 0),
    [lines]
  );

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setLines([{ product_id: "", rate: "", qty: "" }]);
    setIsFormOpen(true);
  };

  const openEdit = (o: ProcOrder) => {
    setEditing(o);
    setForm({
      order_date: o.order_date,
      vendor_id: o.vendor_id || "",
      po_number: o.po_number || "",
      site_id: o.site_id || "",
      entity_id: o.entity_id || "",
      status: (o.status as ProcStatus) || "Draft",
      grn_number: o.grn_number || "",
      grn_status: o.grn_status || "",
    });
    const items = (o.procurement_items || []).map((it) => ({
      id: it.id, product_id: it.product_id || "", rate: String(it.rate ?? ""), qty: String(it.qty ?? ""),
    }));
    setLines(items.length ? items : [{ product_id: "", rate: "", qty: "" }]);
    setIsFormOpen(true);
  };

  const updateLine = (i: number, patch: Partial<LineItem>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((prev) => [...prev, { product_id: "", rate: "", qty: "" }]);
  const removeLine = (i: number) =>
    setLines((prev) => (prev.length <= 1 ? [{ product_id: "", rate: "", qty: "" }] : prev.filter((_, idx) => idx !== i)));

  const handleSave = async () => {
    const validLines = lines.filter((l) => l.product_id && (parseFloat(l.qty) || 0) > 0);
    if (validLines.length === 0) { toast.error("Add at least one product line item"); return; }
    setIsSaving(true);
    try {
      const orderPayload = {
        order_date: form.order_date,
        vendor_id: form.vendor_id || null,
        po_number: form.po_number.trim() || null,
        site_id: form.site_id || null,
        entity_id: form.entity_id || null,
        status: form.status,
        grn_number: form.grn_number.trim() || null,
        grn_status: form.grn_status.trim() || null,
        total_amount: lineTotal,
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
        const rate = parseFloat(l.rate) || 0;
        const qty = parseFloat(l.qty) || 0;
        return { procurement_id: orderId, product_id: l.product_id, rate, qty, amount: rate * qty };
      });
      const { error: itemErr } = await supabase.from("procurement_items").insert(itemRows);
      if (itemErr) throw itemErr;

      toast.success(editing ? "Procurement updated" : "Procurement created");
      setIsFormOpen(false);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to save procurement");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("procurement_orders").delete().eq("id", id);
    if (error) toast.error(error.message || "Failed to delete");
    else { toast.success("Procurement deleted"); fetchAll(); }
    setDeleteId(null);
  };

  const filtered = useMemo(() => {
    let list = orders;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (o) =>
          (o.po_number || "").toLowerCase().includes(q) ||
          vName(o.vendor_id).toLowerCase().includes(q) ||
          sName(o.site_id).toLowerCase().includes(q)
      );
    }
    if (filterStatus !== "all") list = list.filter((o) => o.status === filterStatus);
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, search, filterStatus, vendors, sites]);

  return (
    <motion.div className="space-y-4 p-4 pb-24 max-w-5xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><ShoppingCart className="h-5 w-5" />Procurement</h1>
          <p className="text-xs text-muted-foreground">{orders.length} purchase orders</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={openAdd} className="gap-1.5"><Plus className="h-4 w-4" />New PO</Button>
        )}
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search PO number, vendor, site..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {STATUSES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">
          {orders.length === 0 ? "No procurement orders yet." : "No orders match your search/filter."}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => (
            <Card key={o.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => isAdmin ? openEdit(o) : undefined}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-sm truncate">{o.po_number || "(No PO #)"}</h3>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusColor(o.status)}`}>{o.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" />{o.order_date} · {vName(o.vendor_id)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">Site: {sName(o.site_id)} · {eName(o.entity_id)}</p>
                    {o.grn_number && (
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><Truck className="h-3 w-3" />GRN: {o.grn_number}{o.grn_status ? ` (${o.grn_status})` : ""}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold text-sm">{fmtAmt(o.total_amount || 0)}</div>
                    <div className="text-[10px] text-muted-foreground">{o.procurement_items?.length || 0} items</div>
                    {isAdmin && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 mt-1 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteId(o.id); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Form */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-none w-screen h-screen sm:rounded-none p-0 gap-0 flex flex-col">
          <DialogHeader className="px-4 py-3 border-b shrink-0">
            <DialogTitle>{editing ? "Edit Procurement" : "New Procurement"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 p-4 overflow-y-auto flex-1 max-w-3xl w-full mx-auto">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" value={form.order_date} onChange={(e) => setForm((p) => ({ ...p, order_date: e.target.value }))} className="h-9" />
              </div>
              <div>
                <Label className="text-xs flex items-center gap-1"><FileText className="h-3 w-3" />PO Number</Label>
                <Input value={form.po_number} onChange={(e) => setForm((p) => ({ ...p, po_number: e.target.value }))} placeholder="PO-0001" className="h-9" />
              </div>
            </div>

            <div>
              <Label className="text-xs">Vendor</Label>
              <Select value={form.vendor_id} onValueChange={(v) => setForm((p) => ({ ...p, vendor_id: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                <SelectContent>{vendors.map((v) => (<SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>))}</SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Site</Label>
                <Select value={form.site_id} onValueChange={(v) => setForm((p) => ({ ...p, site_id: v }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select site" /></SelectTrigger>
                  <SelectContent>{sites.map((s) => (<SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Entity</Label>
                <Select value={form.entity_id} onValueChange={(v) => setForm((p) => ({ ...p, entity_id: v }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select entity" /></SelectTrigger>
                  <SelectContent>{entities.map((e) => (<SelectItem key={e.id} value={e.id}>{e.entity_name}</SelectItem>))}</SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v as ProcStatus }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent>
              </Select>
            </div>

            {/* Line items */}
            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">Product Line Items</Label>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary" onClick={addLine}><Plus className="h-3 w-3" />Add Item</Button>
              </div>
              <div className="space-y-3">
                {lines.map((l, i) => {
                  const amt = (parseFloat(l.rate) || 0) * (parseFloat(l.qty) || 0);
                  return (
                    <div key={i} className="rounded-lg border p-2.5 space-y-2 bg-muted/30">
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <Select value={l.product_id} onValueChange={(v) => updateLine(i, { product_id: v })}>
                            <SelectTrigger className="h-9"><SelectValue placeholder="Select product" /></SelectTrigger>
                            <SelectContent>{products.map((p) => (<SelectItem key={p.id} value={p.id}>{p.product_name}</SelectItem>))}</SelectContent>
                          </Select>
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeLine(i)}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Rate</Label>
                          <Input type="number" inputMode="decimal" value={l.rate} onChange={(e) => updateLine(i, { rate: e.target.value })} placeholder="0" className="h-8" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Qty</Label>
                          <Input type="number" inputMode="decimal" value={l.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} placeholder="0" className="h-8" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Amount</Label>
                          <div className="h-8 flex items-center text-sm font-medium">{fmtAmt(amt)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-3 pt-2 border-t">
                <span className="text-sm font-semibold">Grand Total</span>
                <span className="text-base font-bold text-primary">{fmtAmt(lineTotal)}</span>
              </div>
            </div>

            {/* GRN */}
            <div className="border-t pt-3 grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs flex items-center gap-1"><Truck className="h-3 w-3" />GRN Number</Label>
                <Input value={form.grn_number} onChange={(e) => setForm((p) => ({ ...p, grn_number: e.target.value }))} placeholder="GRN-0001" className="h-9" />
              </div>
              <div>
                <Label className="text-xs">GRN Status</Label>
                <Input value={form.grn_status} onChange={(e) => setForm((p) => ({ ...p, grn_status: e.target.value }))} placeholder="e.g., Received" className="h-9" />
              </div>
            </div>

            <div className="flex gap-2 pt-2 pb-6">
              <Button variant="outline" className="flex-1" onClick={() => setIsFormOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleSave} disabled={isSaving}><Save className="h-4 w-4 mr-2" />{isSaving ? "Saving..." : "Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
    </motion.div>
  );
}
