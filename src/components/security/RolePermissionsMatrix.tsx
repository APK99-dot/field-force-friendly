import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Shield, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Permission {
  id: string;
  profile_id: string;
  object_name: string;
  can_read: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_view_all: boolean;
  can_modify_all: boolean;
}

const PERMISSION_FIELDS = ["can_read", "can_create", "can_edit", "can_delete", "can_view_all", "can_modify_all"] as const;
const FIELD_LABELS: Record<string, string> = {
  can_read: "Read",
  can_create: "Create",
  can_edit: "Edit",
  can_delete: "Delete",
  can_view_all: "View All",
  can_modify_all: "Modify All",
};

interface Props {
  profileId: string;
  profileName: string;
}

export default function RolePermissionsMatrix({ profileId, profileName }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newObject, setNewObject] = useState("");

  const permsQuery = useQuery({
    queryKey: ["profile-permissions", profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_object_permissions")
        .select("*")
        .eq("profile_id", profileId)
        .order("object_name");
      if (error) throw error;
      return (data || []) as Permission[];
    },
  });

  const togglePermission = useMutation({
    mutationFn: async ({ permId, field, value }: { permId: string; field: string; value: boolean }) => {
      const { error } = await supabase
        .from("profile_object_permissions")
        .update({ [field]: value })
        .eq("id", permId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-permissions", profileId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addObject = useMutation({
    mutationFn: async () => {
      if (!newObject.trim()) throw new Error("Object name required");
      const { error } = await supabase.from("profile_object_permissions").insert({
        profile_id: profileId,
        object_name: newObject.trim().toLowerCase(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-permissions", profileId] });
      toast.success("Object added");
      setNewObject("");
      setAddOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeObject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("profile_object_permissions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-permissions", profileId] });
      toast.success("Object removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleAll = useMutation({
    mutationFn: async ({ permId, enable }: { permId: string; enable: boolean }) => {
      const update: Record<string, boolean> = {};
      PERMISSION_FIELDS.forEach((f) => { update[f] = enable; });
      const { error } = await supabase.from("profile_object_permissions").update(update).eq("id", permId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-permissions", profileId] });
    },
  });

  const permissions = (permsQuery.data || []).filter((p) =>
    p.object_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Permissions for: {profileName}</h2>
            <p className="text-xs text-muted-foreground">{permissions.length} objects configured</p>
          </div>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" />Add Object</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Permission Object</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Object Name</Label>
                <Input value={newObject} onChange={(e) => setNewObject(e.target.value)} placeholder="e.g. invoices, territories" />
              </div>
              <Button onClick={() => addObject.mutate()} disabled={addObject.isPending} className="w-full">
                {addObject.isPending ? "Adding..." : "Add Object"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search objects..." className="pl-9" />
      </div>

      {permissions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No permission objects configured for this profile. Add one to get started.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] font-medium text-muted-foreground py-2 h-8">Object</TableHead>
                  {PERMISSION_FIELDS.map((f) => (
                    <TableHead key={f} className="text-[11px] font-medium text-muted-foreground py-2 h-8 text-center w-20">
                      {FIELD_LABELS[f]}
                    </TableHead>
                  ))}
                  <TableHead className="text-[11px] font-medium text-muted-foreground py-2 h-8 text-center w-24">All</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {permissions.map((perm) => {
                  const allEnabled = PERMISSION_FIELDS.every((f) => perm[f]);
                  return (
                    <TableRow key={perm.id}>
                      <TableCell className="font-medium text-sm capitalize py-1.5">{perm.object_name}</TableCell>
                      {PERMISSION_FIELDS.map((field) => (
                        <TableCell key={field} className="text-center py-1.5">
                          <Switch
                            checked={perm[field]}
                            onCheckedChange={(v) => togglePermission.mutate({ permId: perm.id, field, value: v })}
                            className="scale-75"
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-center py-1.5">
                        <div className="flex items-center justify-center gap-1">
                          <Switch
                            checked={allEnabled}
                            onCheckedChange={(v) => toggleAll.mutate({ permId: perm.id, enable: v })}
                            className="scale-75"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={() => removeObject.mutate(perm.id)}
                          >
                            <span className="text-xs">×</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
