import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Save, Search, Building } from "lucide-react";

interface EntityRow {
  id: string;
  entity_name: string;
  entity_code: string | null;
  address: string | null;
  gst_number: string | null;
  contact_person: string | null;
  contact_number: string | null;
  is_active: boolean;
}

const emptyForm = {
  entity_name: "", entity_code: "", address: "", gst_number: "",
  contact_person: "", contact_number: "", is_active: true,
};

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

export default function EntityMaster() {
  const [rows, setRows] = useState<EntityRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EntityRow | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => { fetchRows(); }, []);

  const fetchRows = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("master_entities")
      .select("id, entity_name, entity_code, address, gst_number, contact_person, contact_number, is_active")
      .order("entity_name");
    if (!error) setRows((data || []) as EntityRow[]);
    setIsLoading(false);
  };

  const openAdd = () => { setEditing(null); setFormData(emptyForm); setIsDialogOpen(true); };

  const openEdit = (r: EntityRow) => {
    setEditing(r);
    setFormData({
      entity_name: r.entity_name, entity_code: r.entity_code || "", address: r.address || "",
      gst_number: r.gst_number || "", contact_person: r.contact_person || "",
      contact_number: r.contact_number || "", is_active: r.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    const name = formData.entity_name.trim();
    if (!name) { toast.error("Entity name is required"); return; }
    setIsSaving(true);
    try {
      const payload = {
        entity_name: name,
        entity_code: formData.entity_code.trim() || null,
        address: formData.address.trim() || null,
        gst_number: formData.gst_number.trim() || null,
        contact_person: formData.contact_person.trim() || null,
        contact_number: formData.contact_number.trim() || null,
        is_active: formData.is_active,
      };
      if (editing) {
        const { error } = await supabase.from("master_entities").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Entity updated");
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from("master_entities").insert({ ...payload, created_by: user?.id });
        if (error) throw error;
        toast.success("Entity created");
      }
      setIsDialogOpen(false);
      fetchRows();
    } catch (err: any) {
      toast.error(err.message || "Failed to save entity");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("master_entities").delete().eq("id", id);
    if (error) {
      if (error.code === "23503") toast.error("Cannot delete: entity is in use. Disable it instead.");
      else toast.error(error.message || "Failed to delete");
    } else {
      toast.success("Entity deleted");
      fetchRows();
    }
    setDeleteConfirmId(null);
  };

  const toggleActive = async (r: EntityRow) => {
    const { error } = await supabase.from("master_entities").update({ is_active: !r.is_active }).eq("id", r.id);
    if (!error) { toast.success(`Entity ${r.is_active ? "disabled" : "enabled"}`); fetchRows(); }
    else toast.error(error.message || "Failed to update");
  };

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return r.entity_name.toLowerCase().includes(q) || (r.entity_code || "").toLowerCase().includes(q) || (r.gst_number || "").toLowerCase().includes(q);
  });

  return (
    <motion.div className="p-4 space-y-6 max-w-6xl mx-auto" variants={container} initial="hidden" animate="show">
      <motion.div variants={item}>
        <h1 className="text-2xl font-bold">Entity Master</h1>
        <p className="text-sm text-muted-foreground">Manage billing entities used in Procurement</p>
      </motion.div>

      <motion.div variants={item}>
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2"><Building className="h-5 w-5" />Entities</CardTitle>
                <CardDescription>Entities are selectable on procurement orders</CardDescription>
              </div>
              <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Entity</Button>
            </div>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search entities..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground"><Building className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>No entities found</p></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>GST Number</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.entity_name}</TableCell>
                      <TableCell>{r.entity_code || "—"}</TableCell>
                      <TableCell>{r.gst_number || "—"}</TableCell>
                      <TableCell>
                        {r.contact_person || r.contact_number ? (
                          <div className="text-xs">
                            <div>{r.contact_person || "—"}</div>
                            <div className="text-muted-foreground">{r.contact_number || ""}</div>
                          </div>
                        ) : "—"}
                      </TableCell>
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
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Entity" : "Add Entity"}</DialogTitle>
            <DialogDescription>Configure the entity details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Entity Name *</Label>
              <Input value={formData.entity_name} onChange={(e) => setFormData({ ...formData, entity_name: e.target.value })} placeholder="e.g., ABC Constructions Pvt Ltd" autoFocus />
            </div>
            <div>
              <Label>Entity Code</Label>
              <Input value={formData.entity_code} onChange={(e) => setFormData({ ...formData, entity_code: e.target.value })} placeholder="e.g., ENT-001" />
            </div>
            <div>
              <Label>Address</Label>
              <Textarea value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Registered address" rows={2} />
            </div>
            <div>
              <Label>GST Number</Label>
              <Input value={formData.gst_number} onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })} placeholder="e.g., 22AAAAA0000A1Z5" />
            </div>
            <div>
              <Label>Contact Person</Label>
              <Input value={formData.contact_person} onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })} placeholder="Name" />
            </div>
            <div>
              <Label>Contact Number</Label>
              <Input value={formData.contact_number} onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })} placeholder="Phone number" type="tel" />
            </div>
            <div className="flex items-center justify-between">
              <div><Label>Active</Label><p className="text-xs text-muted-foreground">Inactive entities are hidden from selection</p></div>
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
