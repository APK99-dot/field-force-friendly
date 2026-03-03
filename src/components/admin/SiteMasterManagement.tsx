import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit, ToggleLeft, ToggleRight, Loader2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Site {
  id: string;
  site_name: string;
  site_code: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export default function SiteMasterManagement() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [form, setForm] = useState({ site_name: "", description: "" });
  const [saving, setSaving] = useState(false);

  const fetchSites = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("project_sites")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
    } else {
      setSites((data || []) as Site[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  const handleOpenCreate = () => {
    setEditingSite(null);
    setForm({ site_name: "", description: "" });
    setShowDialog(true);
  };

  const handleOpenEdit = (site: Site) => {
    setEditingSite(site);
    setForm({ site_name: site.site_name, description: site.description || "" });
    setShowDialog(true);
  };

  const handleSave = async () => {
    const trimmed = form.site_name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (editingSite) {
        const { error } = await supabase
          .from("project_sites")
          .update({ site_name: trimmed, description: form.description || null })
          .eq("id", editingSite.id);
        if (error) throw error;
        toast.success("Site updated");
      } else {
        const { error } = await supabase
          .from("project_sites")
          .insert({ site_name: trimmed, description: form.description || null, created_by: user?.id });
        if (error) throw error;
        toast.success("Site created");
      }
      setShowDialog(false);
      fetchSites();
    } catch (err: any) {
      toast.error(err.message || "Failed to save site");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (site: Site) => {
    const newActive = !site.is_active;
    const { error } = await supabase
      .from("project_sites")
      .update({
        is_active: newActive,
        deleted_at: newActive ? null : new Date().toISOString(),
      })
      .eq("id", site.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(newActive ? "Site reactivated" : "Site deactivated");
      fetchSites();
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Project / Site Master
        </CardTitle>
        <Button onClick={handleOpenCreate} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Site
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sites.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No sites created yet. Click "Add Site" to create one.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.map((site) => (
                <TableRow key={site.id}>
                  <TableCell className="font-medium">{site.site_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{site.site_code}</TableCell>
                  <TableCell>
                    <Badge variant={site.is_active ? "default" : "secondary"}>
                      {site.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(site.created_at), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEdit(site)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleToggleActive(site)}
                        title={site.is_active ? "Deactivate" : "Reactivate"}
                      >
                        {site.is_active ? (
                          <ToggleRight className="h-4 w-4 text-success" />
                        ) : (
                          <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editingSite ? "Edit Site" : "Add New Site"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label className="text-xs">Site Name *</Label>
              <Input
                value={form.site_name}
                onChange={(e) => setForm({ ...form, site_name: e.target.value })}
                placeholder="e.g. Koramangala Site"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description..."
                rows={3}
              />
            </div>
            <Button className="w-full" onClick={handleSave} disabled={saving || !form.site_name.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {saving ? "Saving..." : editingSite ? "Update Site" : "Create Site"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
