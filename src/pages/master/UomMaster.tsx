import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Save, Search, Ruler } from "lucide-react";

interface UomRow {
  id: string;
  uom_name: string;
  uom_code: string | null;
  is_active: boolean;
}

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

export default function UomMaster() {
  const [rows, setRows] = useState<UomRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UomRow | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ uom_name: "", uom_code: "", is_active: true });

  useEffect(() => { fetchRows(); }, []);

  const fetchRows = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("master_uom")
      .select("id, uom_name, uom_code, is_active")
      .order("uom_name");
    if (!error) setRows((data || []) as UomRow[]);
    setIsLoading(false);
  };

  const openAdd = () => {
    setEditing(null);
    setFormData({ uom_name: "", uom_code: "", is_active: true });
    setIsDialogOpen(true);
  };

  const openEdit = (r: UomRow) => {
    setEditing(r);
    setFormData({ uom_name: r.uom_name, uom_code: r.uom_code || "", is_active: r.is_active });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    const name = formData.uom_name.trim();
    const code = formData.uom_code.trim();
    if (!name) { toast.error("Unit name is required"); return; }
    setIsSaving(true);
    try {
      const payload = { uom_name: name, uom_code: code || null, is_active: formData.is_active };
      if (editing) {
        const { error } = await supabase.from("master_uom").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Unit updated");
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from("master_uom").insert({ ...payload, created_by: user?.id });
        if (error) throw error;
        toast.success("Unit created");
      }
      setIsDialogOpen(false);
      fetchRows();
    } catch (err: any) {
      if (err.code === "23505") toast.error("A unit with this name already exists");
      else toast.error(err.message || "Failed to save unit");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("master_uom").delete().eq("id", id);
    if (error) {
      if (error.code === "23503") toast.error("Cannot delete: unit is in use. Disable it instead.");
      else toast.error(error.message || "Failed to delete");
    } else {
      toast.success("Unit deleted");
      fetchRows();
    }
    setDeleteConfirmId(null);
  };

  const toggleActive = async (r: UomRow) => {
    const { error } = await supabase.from("master_uom").update({ is_active: !r.is_active }).eq("id", r.id);
    if (!error) { toast.success(`Unit ${r.is_active ? "disabled" : "enabled"}`); fetchRows(); }
    else toast.error(error.message || "Failed to update");
  };

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return r.uom_name.toLowerCase().includes(q) || (r.uom_code || "").toLowerCase().includes(q);
  });

  return (
    <motion.div className="p-4 space-y-6 max-w-6xl mx-auto" variants={container} initial="hidden" animate="show">
      <motion.div variants={item}>
        <h1 className="text-2xl font-bold">UOM Master</h1>
        <p className="text-sm text-muted-foreground">Manage units of measure used across products and procurement</p>
      </motion.div>

      <motion.div variants={item}>
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2"><Ruler className="h-5 w-5" />Units of Measure</CardTitle>
                <CardDescription>A single source of truth for UOM dropdowns</CardDescription>
              </div>
              <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Unit</Button>
            </div>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search units..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground"><Ruler className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>No units found</p></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unit Name</TableHead>
                    <TableHead>Short Code</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.uom_name}</TableCell>
                      <TableCell>{r.uom_code || "—"}</TableCell>
                      <TableCell className="text-center">
                        <Badge
                          className={r.is_active ? "bg-[hsl(var(--success))]/20 text-[hsl(var(--success))] cursor-pointer" : "bg-destructive/20 text-destructive cursor-pointer"}
                          onClick={() => toggleActive(r)}
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
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Unit" : "Add Unit"}</DialogTitle>
            <DialogDescription>Configure the unit of measure details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Unit Name *</Label>
              <Input value={formData.uom_name} onChange={(e) => setFormData({ ...formData, uom_name: e.target.value })} placeholder="e.g., Nos" autoFocus />
            </div>
            <div>
              <Label>Short Code</Label>
              <Input value={formData.uom_code} onChange={(e) => setFormData({ ...formData, uom_code: e.target.value })} placeholder="e.g., NOS" />
            </div>
            <div className="flex items-center justify-between">
              <div><Label>Active</Label><p className="text-xs text-muted-foreground">Inactive units are hidden from selection</p></div>
              <Switch checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}><Save className="h-4 w-4 mr-2" />{isSaving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
