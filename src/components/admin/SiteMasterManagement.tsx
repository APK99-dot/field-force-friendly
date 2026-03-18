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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Edit, ToggleLeft, ToggleRight, Loader2, Building2, Users, Search } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface Site {
  id: string;
  site_name: string;
  site_code: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
  start_date: string;
  end_date: string | null;
}

interface UserOption {
  id: string;
  full_name: string;
}

export default function SiteMasterManagement() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [form, setForm] = useState({ site_name: "", description: "", start_date: new Date().toISOString().split("T")[0], end_date: "" });
  const [saving, setSaving] = useState(false);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [siteAssignments, setSiteAssignments] = useState<Record<string, string[]>>({});
  const [userSearch, setUserSearch] = useState("");

  const fetchUsers = useCallback(async () => {
    const { data } = await supabase.from("users").select("id, full_name").eq("is_active", true).order("full_name");
    setAllUsers((data || []).map((u: any) => ({ id: u.id, full_name: u.full_name || "Unnamed" })));
  }, []);

  const fetchAssignments = useCallback(async () => {
    const { data } = await supabase.from("site_assignments").select("site_id, user_id");
    const map: Record<string, string[]> = {};
    (data || []).forEach((a: any) => {
      if (!map[a.site_id]) map[a.site_id] = [];
      map[a.site_id].push(a.user_id);
    });
    setSiteAssignments(map);
  }, []);

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
    fetchUsers();
    fetchAssignments();
  }, [fetchSites, fetchUsers, fetchAssignments]);

  const handleOpenCreate = () => {
    setEditingSite(null);
    setForm({ site_name: "", description: "", start_date: new Date().toISOString().split("T")[0], end_date: "" });
    setSelectedUserIds([]);
    setUserSearch("");
    setShowDialog(true);
  };

  const handleOpenEdit = (site: Site) => {
    setEditingSite(site);
    setForm({ site_name: site.site_name, description: site.description || "", start_date: site.start_date || "", end_date: site.end_date || "" });
    setSelectedUserIds(siteAssignments[site.id] || []);
    setUserSearch("");
    setShowDialog(true);
  };

  const handleSave = async () => {
    const trimmed = form.site_name.trim();
    if (!trimmed) return;
    if (!form.start_date) { toast.error("Start Date is required"); return; }
    if (form.end_date && form.end_date < form.start_date) { toast.error("End Date cannot be earlier than Start Date"); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let siteId: string;
      const payload: any = {
        site_name: trimmed,
        description: form.description || null,
        start_date: form.start_date,
        end_date: form.end_date || null,
      };

      if (editingSite) {
        const { error } = await supabase
          .from("project_sites")
          .update(payload)
          .eq("id", editingSite.id);
        if (error) throw error;
        siteId = editingSite.id;
        toast.success("Site updated");
      } else {
        payload.created_by = user?.id;
        const { data: newSite, error } = await supabase
          .from("project_sites")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        siteId = newSite.id;

        // Auto-assign creator
        if (user?.id && !selectedUserIds.includes(user.id)) {
          setSelectedUserIds(prev => [...prev, user.id]);
        }
        toast.success("Site created");
      }

      // Sync assignments: delete removed, insert new
      const currentAssigned = siteAssignments[siteId] || [];
      const toRemove = currentAssigned.filter(uid => !selectedUserIds.includes(uid));
      const toAdd = selectedUserIds.filter(uid => !currentAssigned.includes(uid));

      // Also auto-add creator for new sites
      if (!editingSite && user?.id && !toAdd.includes(user.id)) {
        toAdd.push(user.id);
      }

      if (toRemove.length > 0) {
        await supabase.from("site_assignments").delete().eq("site_id", siteId).in("user_id", toRemove);
      }
      if (toAdd.length > 0) {
        await supabase.from("site_assignments").insert(
          toAdd.map(uid => ({ site_id: siteId, user_id: uid, assigned_by: user?.id }))
        );
      }

      setShowDialog(false);
      fetchSites();
      fetchAssignments();
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

  const toggleUser = (userId: string) => {
    setSelectedUserIds(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const getAssignedNames = (siteId: string) => {
    const ids = siteAssignments[siteId] || [];
    return ids.map(id => allUsers.find(u => u.id === id)?.full_name || "Unknown").slice(0, 3);
  };

  const filteredUsers = allUsers.filter(u =>
    u.full_name.toLowerCase().includes(userSearch.toLowerCase())
  );

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
                <TableHead>Assigned Users</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.map((site) => {
                const assignedNames = getAssignedNames(site.id);
                const totalAssigned = (siteAssignments[site.id] || []).length;
                return (
                  <TableRow key={site.id}>
                    <TableCell className="font-medium">{site.site_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{site.site_code}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        {totalAssigned === 0 ? (
                          <span className="text-xs text-muted-foreground">None</span>
                        ) : (
                          <span className="text-xs">
                            {assignedNames.join(", ")}
                            {totalAssigned > 3 && ` +${totalAssigned - 3}`}
                          </span>
                        )}
                      </div>
                    </TableCell>
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
                            <ToggleRight className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{editingSite ? "Edit Site" : "Add New Site"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
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
                rows={2}
              />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1.5 mb-2">
                <Users className="h-3.5 w-3.5" />
                Assign Users ({selectedUserIds.length} selected)
              </Label>
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search users..."
                  className="pl-8 h-9 text-sm"
                />
              </div>
              <ScrollArea className="h-[180px] border rounded-lg">
                <div className="p-2 space-y-1">
                  {filteredUsers.map(user => {
                    const isSelected = selectedUserIds.includes(user.id);
                    const initials = user.full_name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
                    return (
                      <label
                        key={user.id}
                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                          isSelected ? "bg-primary/10" : "hover:bg-muted/50"
                        }`}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleUser(user.id)}
                        />
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-[10px] bg-muted">{initials}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{user.full_name}</span>
                      </label>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">No users found</p>
                  )}
                </div>
              </ScrollArea>
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
