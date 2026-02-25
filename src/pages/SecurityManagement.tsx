import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Role {
  id: string;
  name: string;
  is_system: boolean;
}

interface Permission {
  id: string;
  object_name: string;
  can_read: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_view_all: boolean;
  can_modify_all: boolean;
}

interface RolePermission {
  id: string;
  role_id: string;
  permission_id: string;
}

export default function SecurityManagement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const rolesQuery = useQuery({
    queryKey: ["roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("roles").select("*").order("name");
      if (error) throw error;
      return (data || []) as Role[];
    },
  });

  const permissionsQuery = useQuery({
    queryKey: ["permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("permissions").select("*").order("object_name");
      if (error) throw error;
      return (data || []) as Permission[];
    },
  });

  const rolePermsQuery = useQuery({
    queryKey: ["role-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("role_permissions").select("*");
      if (error) throw error;
      return (data || []) as RolePermission[];
    },
  });

  const togglePermission = useMutation({
    mutationFn: async ({ permId, field, value }: { permId: string; field: string; value: boolean }) => {
      const { error } = await supabase.from("permissions").update({ [field]: value }).eq("id", permId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permissions"] });
      toast.success("Permission updated");
    },
  });

  const linkPermToRole = useMutation({
    mutationFn: async ({ roleId, permissionId }: { roleId: string; permissionId: string }) => {
      const { error } = await supabase.from("role_permissions").insert({ role_id: roleId, permission_id: permissionId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
      toast.success("Permission linked to role");
    },
  });

  const unlinkPermFromRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("role_permissions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
      toast.success("Permission unlinked from role");
    },
  });

  // Add Permission Dialog
  const [addOpen, setAddOpen] = useState(false);
  const [newObjName, setNewObjName] = useState("");
  const addPermission = useMutation({
    mutationFn: async () => {
      if (!newObjName.trim()) throw new Error("Object name required");
      const { error } = await supabase.from("permissions").insert({ object_name: newObjName.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permissions"] });
      toast.success("Permission added");
      setNewObjName("");
      setAddOpen(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const roles = rolesQuery.data || [];
  const permissions = permissionsQuery.data || [];
  const rolePerms = rolePermsQuery.data || [];

  return (
    <motion.div className="p-4 space-y-6 max-w-6xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin-controls")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Security & Access</h1>
          <p className="text-sm text-muted-foreground">Manage permissions per role</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" />Add Permission</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Permission Object</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Object Name</Label>
                <Input value={newObjName} onChange={(e) => setNewObjName(e.target.value)} placeholder="e.g. visits, expenses" />
              </div>
              <Button onClick={() => addPermission.mutate()} disabled={addPermission.isPending}>
                {addPermission.isPending ? "Adding..." : "Add"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {roles.map((role) => {
        const linkedPermIds = rolePerms.filter((rp) => rp.role_id === role.id).map((rp) => rp.permission_id);
        const linkedPerms = permissions.filter((p) => linkedPermIds.includes(p.id));
        const unlinkedPerms = permissions.filter((p) => !linkedPermIds.includes(p.id));

        return (
          <Card key={role.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{role.name}</CardTitle>
                {role.is_system && <Badge variant="secondary">System</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              {linkedPerms.length === 0 ? (
                <p className="text-sm text-muted-foreground mb-3">No permissions linked to this role</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Object</TableHead>
                      <TableHead>Read</TableHead>
                      <TableHead>Create</TableHead>
                      <TableHead>Edit</TableHead>
                      <TableHead>Delete</TableHead>
                      <TableHead>View All</TableHead>
                      <TableHead>Modify All</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linkedPerms.map((perm) => (
                      <TableRow key={perm.id}>
                        <TableCell className="font-medium text-sm">{perm.object_name}</TableCell>
                        {(["can_read", "can_create", "can_edit", "can_delete", "can_view_all", "can_modify_all"] as const).map((field) => (
                          <TableCell key={field}>
                            <Switch
                              checked={perm[field]}
                              onCheckedChange={(v) => togglePermission.mutate({ permId: perm.id, field, value: v })}
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {unlinkedPerms.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="text-xs text-muted-foreground self-center">Link:</span>
                  {unlinkedPerms.map((p) => (
                    <Button
                      key={p.id}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => linkPermToRole.mutate({ roleId: role.id, permissionId: p.id })}
                    >
                      + {p.object_name}
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </motion.div>
  );
}
