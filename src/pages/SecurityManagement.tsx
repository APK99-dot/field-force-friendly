import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function SecurityManagement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const profilesQuery = useQuery({
    queryKey: ["security-profiles-full"],
    queryFn: async () => {
      const { data, error } = await supabase.from("security_profiles").select("*").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const permissionsQuery = useQuery({
    queryKey: ["all-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profile_object_permissions").select("*");
      if (error) throw error;
      return data || [];
    },
  });

  const togglePermission = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: boolean }) => {
      const { error } = await supabase.from("profile_object_permissions").update({ [field]: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-permissions"] });
      toast.success("Permission updated");
    },
  });

  const profiles = profilesQuery.data || [];
  const permissions = permissionsQuery.data || [];

  return (
    <motion.div className="p-4 space-y-6 max-w-6xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin-controls")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Security & Access</h1>
          <p className="text-sm text-muted-foreground">Manage security profiles and permissions</p>
        </div>
      </div>

      {profiles.map((profile) => {
        const profilePerms = permissions.filter((p) => p.profile_id === profile.id);
        return (
          <Card key={profile.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{profile.name}</CardTitle>
                {profile.is_system && <Badge variant="secondary">System</Badge>}
              </div>
              {profile.description && <p className="text-xs text-muted-foreground">{profile.description}</p>}
            </CardHeader>
            <CardContent>
              {profilePerms.length === 0 ? (
                <p className="text-sm text-muted-foreground">No permissions configured</p>
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
                    {profilePerms.map((perm) => (
                      <TableRow key={perm.id}>
                        <TableCell className="font-medium text-sm">{perm.object_name}</TableCell>
                        {["can_read", "can_create", "can_edit", "can_delete", "can_view_all", "can_modify_all"].map((field) => (
                          <TableCell key={field}>
                            <Switch
                              checked={(perm as any)[field]}
                              onCheckedChange={(v) => togglePermission.mutate({ id: perm.id, field, value: v })}
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        );
      })}
    </motion.div>
  );
}
