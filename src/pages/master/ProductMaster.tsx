import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Save, Search, Package, Cloud } from "lucide-react";
import { UOM_OPTIONS } from "@/lib/procurement";
import { useUserProfile } from "@/hooks/useUserProfile";

interface CategoryRow {
  id: string;
  category_name: string;
  sub_category_name: string | null;
  is_active: boolean;
}

interface ProductRow {
  id: string;
  product_name: string;
  category_id: string | null;
  default_uom: string | null;
  is_active: boolean;
  product_description: string | null;
  budgeted_rate: number | null;
  lead_time_days: number | null;
  quality_instruction: string | null;
  delivery_instruction: string | null;
}

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

const categoryLabel = (c?: CategoryRow) =>
  c ? `${c.category_name}${c.sub_category_name ? " — " + c.sub_category_name : ""}` : "—";

const emptyForm = {
  product_name: "",
  category_id: "",
  default_uom: "",
  is_active: true,
  product_description: "",
  budgeted_rate: "",
  lead_time_days: "",
  quality_instruction: "",
  delivery_instruction: "",
};

export default function ProductMaster() {
  const { isAdmin } = useUserProfile();
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [importConfirm, setImportConfirm] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setIsLoading(true);
    const [{ data: prods }, { data: cats }] = await Promise.all([
      supabase.from("master_products").select("id, product_name, category_id, default_uom, is_active, product_description, budgeted_rate, lead_time_days, quality_instruction, delivery_instruction").order("product_name"),
      supabase.from("master_categories").select("id, category_name, sub_category_name, is_active").order("category_name"),
    ]);
    setRows((prods || []) as ProductRow[]);
    setCategories((cats || []) as CategoryRow[]);
    setIsLoading(false);
  };

  const catById = (id: string | null) => categories.find((c) => c.id === id);

  const openAdd = () => {
    setEditing(null);
    setFormData(emptyForm);
    setIsDialogOpen(true);
  };

  const openEdit = (r: ProductRow) => {
    setEditing(r);
    setFormData({
      product_name: r.product_name,
      category_id: r.category_id || "",
      default_uom: r.default_uom || "",
      is_active: r.is_active,
      product_description: r.product_description || "",
      budgeted_rate: r.budgeted_rate != null ? String(r.budgeted_rate) : "",
      lead_time_days: r.lead_time_days != null ? String(r.lead_time_days) : "",
      quality_instruction: r.quality_instruction || "",
      delivery_instruction: r.delivery_instruction || "",
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    const name = formData.product_name.trim();
    if (!name) { toast.error("Product name is required"); return; }
    setIsSaving(true);
    try {
      const payload = {
        product_name: name,
        category_id: formData.category_id || null,
        default_uom: formData.default_uom || null,
        is_active: formData.is_active,
        product_description: formData.product_description.trim() || null,
        budgeted_rate: formData.budgeted_rate.trim() !== "" ? Number(formData.budgeted_rate) : null,
        lead_time_days: formData.lead_time_days.trim() !== "" ? parseInt(formData.lead_time_days, 10) : null,
        quality_instruction: formData.quality_instruction.trim() || null,
        delivery_instruction: formData.delivery_instruction.trim() || null,
      };
      if (editing) {
        const { error } = await supabase.from("master_products").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Product updated");
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from("master_products").insert({ ...payload, created_by: user?.id });
        if (error) throw error;
        toast.success("Product created");
      }
      setIsDialogOpen(false);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to save product");
    } finally {
      setIsSaving(false);
    }
  };

  const handleImport = async () => {
    setIsImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("import-salesforce-products", { body: {} });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const res = data as { total: number; added: number; updated: number; skipped: number };
      setImportConfirm(false);
      toast.success(`Salesforce import complete: ${res.added} added, ${res.updated} updated, ${res.skipped} skipped (of ${res.total}).`);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || "Import failed");
    } finally {
      setIsImporting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("master_products").delete().eq("id", id);
    if (error) {
      if (error.code === "23503") toast.error("Cannot delete: product is in use. Disable it instead.");
      else toast.error(error.message || "Failed to delete");
    } else {
      toast.success("Product deleted");
      fetchAll();
    }
    setDeleteConfirmId(null);
  };

  const toggleActive = async (r: ProductRow) => {
    const { error } = await supabase.from("master_products").update({ is_active: !r.is_active }).eq("id", r.id);
    if (!error) { toast.success(`Product ${r.is_active ? "disabled" : "enabled"}`); fetchAll(); }
    else toast.error(error.message || "Failed to update");
  };

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return r.product_name.toLowerCase().includes(q) || categoryLabel(catById(r.category_id)).toLowerCase().includes(q);
  });

  return (
    <motion.div className="p-4 space-y-6 max-w-6xl mx-auto" variants={container} initial="hidden" animate="show">
      <motion.div variants={item}>
        <h1 className="text-2xl font-bold">Product Master</h1>
        <p className="text-sm text-muted-foreground">Manage products and link them to categories</p>
      </motion.div>

      <motion.div variants={item}>
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" />Products</CardTitle>
                <CardDescription>Category and sub category come from Category Master</CardDescription>
              </div>
              <div className="flex gap-2">
                {isAdmin && (
                  <Button variant="outline" onClick={() => setImportConfirm(true)}>
                    <Cloud className="h-4 w-4 mr-2" />Import from Salesforce
                  </Button>
                )}
                <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Product</Button>
              </div>
            </div>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground"><Package className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>No products found</p></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Default UOM</TableHead>
                    <TableHead className="text-right">Budgeted Rate</TableHead>
                    <TableHead className="text-center">Lead Time</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const c = catById(r.category_id);
                    return (
                      <TableRow key={r.id} onClick={() => openEdit(r)} className="cursor-pointer">
                        <TableCell className="font-medium">{r.product_name}</TableCell>
                        <TableCell>{c?.category_name || "—"}</TableCell>
                        <TableCell>{r.default_uom || "—"}</TableCell>
                        <TableCell className="text-right">{r.budgeted_rate != null ? `₹${Number(r.budgeted_rate).toLocaleString("en-IN")}` : "—"}</TableCell>
                        <TableCell className="text-center">{r.lead_time_days != null ? `${r.lead_time_days}d` : "—"}</TableCell>
                        <TableCell className="text-center">
                          <Badge
                            className={r.is_active ? "bg-[hsl(var(--success))]/20 text-[hsl(var(--success))] cursor-pointer" : "bg-destructive/20 text-destructive cursor-pointer"}
                            onClick={(e) => { e.stopPropagation(); toggleActive(r); }}
                          >
                            {r.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => openEdit(r)}><Edit className="h-4 w-4" /></Button>
                            {deleteConfirmId === r.id ? (
                              <div className="flex gap-1">
                                <Button variant="destructive" size="sm" onClick={() => handleDelete(r.id)}>Confirm</Button>
                                <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
                              </div>
                            ) : (
                              <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Product" : "Add Product"}</DialogTitle>
            <DialogDescription>Configure the product details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Product Name *</Label>
              <Input value={formData.product_name} onChange={(e) => setFormData({ ...formData, product_name: e.target.value })} placeholder="e.g., TMT Steel Bar" autoFocus />
            </div>
            <div>
              <Label>Product Description</Label>
              <Input value={formData.product_description} onChange={(e) => setFormData({ ...formData, product_description: e.target.value })} placeholder="Short description" />
            </div>
            <div>
              <Label>Category / Sub Category</Label>
              <Select value={formData.category_id} onValueChange={(val) => setFormData({ ...formData, category_id: val })}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.filter((c) => c.is_active || c.id === formData.category_id).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{categoryLabel(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Default UOM</Label>
                <Select value={formData.default_uom} onValueChange={(val) => setFormData({ ...formData, default_uom: val })}>
                  <SelectTrigger><SelectValue placeholder="Select UOM" /></SelectTrigger>
                  <SelectContent>
                    {(formData.default_uom && !UOM_OPTIONS.includes(formData.default_uom as any)
                      ? [formData.default_uom, ...UOM_OPTIONS]
                      : UOM_OPTIONS
                    ).map((u) => (<SelectItem key={u} value={u}>{u}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Lead Time (days)</Label>
                <Input type="number" min={0} value={formData.lead_time_days} onChange={(e) => setFormData({ ...formData, lead_time_days: e.target.value })} placeholder="e.g., 5" />
              </div>
            </div>
            <div>
              <Label>Budgeted Rate per Unit (₹)</Label>
              <Input type="number" min={0} step="0.01" value={formData.budgeted_rate} onChange={(e) => setFormData({ ...formData, budgeted_rate: e.target.value })} placeholder="e.g., 3700" />
            </div>
            <div>
              <Label>Quality Instruction</Label>
              <Textarea value={formData.quality_instruction} onChange={(e) => setFormData({ ...formData, quality_instruction: e.target.value })} placeholder="Quality check notes" rows={2} />
            </div>
            <div>
              <Label>Delivery (GRN) Instruction</Label>
              <Textarea value={formData.delivery_instruction} onChange={(e) => setFormData({ ...formData, delivery_instruction: e.target.value })} placeholder="Delivery / receiving notes" rows={2} />
            </div>
            <div className="flex items-center justify-between">
              <div><Label>Active</Label><p className="text-xs text-muted-foreground">Inactive items are hidden from selection</p></div>
              <Switch checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}><Save className="h-4 w-4 mr-2" />{isSaving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={importConfirm} onOpenChange={(open) => !open && !isImporting && setImportConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import products from Salesforce</AlertDialogTitle>
            <AlertDialogDescription>
              This pulls all products from Salesforce and adds them here. Existing Salesforce-linked
              products are updated, not duplicated. This may take a moment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isImporting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleImport(); }} disabled={isImporting}>
              {isImporting ? "Importing..." : "Import"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
