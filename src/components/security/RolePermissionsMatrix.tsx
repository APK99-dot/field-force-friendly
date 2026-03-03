import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import HierarchicalPermissionEditor, { PermissionState } from "./HierarchicalPermissionEditor";
import { PERMISSION_MODULES } from "./permissionModules";
import { HIERARCHICAL_MODULES, getPermissionType, getParentModule } from "./hierarchicalPermissions";

interface SecurityProfile {
  id: string;
  profile_name: string;
  is_system: boolean;
}

// Build initial empty permission state with all items
function buildEmptyPermissions(): PermissionState {
  const state: PermissionState = {};
  for (const mod of PERMISSION_MODULES) {
    state[mod.name] = {
      canRead: false, canCreate: false, canEdit: false, canDelete: false,
      permissionType: "module", parentModule: null,
    };
  }
  for (const mod of HIERARCHICAL_MODULES) {
    for (const f of mod.fields) {
      state[f.name] = {
        canRead: false, canCreate: false, canEdit: false, canDelete: false,
        permissionType: "field", parentModule: mod.module,
      };
    }
    for (const a of mod.actions) {
      state[a.name] = {
        canRead: false, canCreate: false, canEdit: false, canDelete: false,
        permissionType: "action", parentModule: mod.module,
      };
    }
    for (const w of mod.widgets) {
      state[w.name] = {
        canRead: false, canCreate: false, canEdit: false, canDelete: false,
        permissionType: "widget", parentModule: mod.module,
      };
    }
  }
  return state;
}

function buildAllEnabledPermissions(): PermissionState {
  const state = buildEmptyPermissions();
  Object.keys(state).forEach((key) => {
    state[key] = { ...state[key], canRead: true, canCreate: true, canEdit: true, canDelete: true };
  });
  return state;
}

export default function RolePermissionsMatrix() {
  const queryClient = useQueryClient();
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [permissions, setPermissions] = useState<PermissionState>(buildEmptyPermissions());
  const [isDirty, setIsDirty] = useState(false);

  // Fetch all profiles
  const profilesQuery = useQuery({
    queryKey: ["security-profiles-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_profiles")
        .select("id, name, is_system")
        .order("is_system", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data || []).map((d) => ({ id: d.id, profile_name: d.name, is_system: d.is_system })) as SecurityProfile[];
    },
  });

  // Auto-select System Administrator
  useEffect(() => {
    if (profilesQuery.data && !selectedProfileId) {
      const sysAdmin = profilesQuery.data.find((p) => p.profile_name === "System Administrator");
      if (sysAdmin) setSelectedProfileId(sysAdmin.id);
      else if (profilesQuery.data.length > 0) setSelectedProfileId(profilesQuery.data[0].id);
    }
  }, [profilesQuery.data, selectedProfileId]);

  const selectedProfile = profilesQuery.data?.find((p) => p.id === selectedProfileId);
  const isSystemAdmin = selectedProfile?.profile_name === "System Administrator";

  // Fetch permissions for selected profile
  const permsQuery = useQuery({
    queryKey: ["profile-permissions-hierarchical", selectedProfileId],
    enabled: !!selectedProfileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_object_permissions")
        .select("*")
        .eq("profile_id", selectedProfileId);
      if (error) throw error;
      return data || [];
    },
  });

  // Populate permissions state from DB
  useEffect(() => {
    if (isSystemAdmin) {
      setPermissions(buildAllEnabledPermissions());
      setIsDirty(false);
      return;
    }
    const base = buildEmptyPermissions();
    if (permsQuery.data) {
      for (const row of permsQuery.data) {
        if (base[row.object_name]) {
          base[row.object_name] = {
            ...base[row.object_name],
            canRead: row.can_read,
            canCreate: row.can_create,
            canEdit: row.can_edit,
            canDelete: row.can_delete,
          };
        }
      }
    }
    setPermissions(base);
    setIsDirty(false);
  }, [permsQuery.data, isSystemAdmin, selectedProfileId]);

  const handleChange = useCallback((updated: PermissionState) => {
    setPermissions(updated);
    setIsDirty(true);
  }, []);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProfileId) throw new Error("No profile selected");

      // Delete existing permissions for this profile
      const { error: delError } = await supabase
        .from("profile_object_permissions")
        .delete()
        .eq("profile_id", selectedProfileId);
      if (delError) throw delError;

      // Insert all permissions
      const rows = Object.entries(permissions).map(([objectName, p]) => ({
        profile_id: selectedProfileId,
        object_name: objectName,
        permission_type: p.permissionType,
        parent_module: p.parentModule,
        can_read: p.canRead,
        can_create: p.canCreate,
        can_edit: p.canEdit,
        can_delete: p.canDelete,
        can_view_all: false,
        can_modify_all: false,
      }));

      const { error: insError } = await supabase
        .from("profile_object_permissions")
        .insert(rows);
      if (insError) throw insError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-permissions-hierarchical", selectedProfileId] });
      toast.success("Permissions saved successfully");
      setIsDirty(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5">
          {/* Profile Selector */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Shield className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Role Permissions</h2>
                <p className="text-xs text-muted-foreground">Configure module, field, action & widget permissions</p>
              </div>
            </div>
            <Button
              size="sm"
              disabled={!isDirty || isSystemAdmin || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Saving...</>
              ) : (
                <><Save className="h-4 w-4 mr-1" />Save Changes</>
              )}
            </Button>
          </div>

          <div className="mb-5">
            <Select value={selectedProfileId} onValueChange={(v) => { setSelectedProfileId(v); setIsDirty(false); }}>
              <SelectTrigger className="w-full max-w-xs">
                <SelectValue placeholder="Select a security profile..." />
              </SelectTrigger>
              <SelectContent>
                {profilesQuery.data?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      {p.profile_name}
                      {p.is_system && <Badge variant="secondary" className="text-[10px] ml-1">System</Badge>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isSystemAdmin && (
            <div className="mb-4 p-3 rounded-lg bg-muted/50 border border-border">
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">System Administrator</span> has all permissions granted automatically and cannot be modified.
              </p>
            </div>
          )}

          {selectedProfileId ? (
            <HierarchicalPermissionEditor
              permissions={permissions}
              readOnly={isSystemAdmin}
              onChange={handleChange}
            />
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">
              Select a security profile to configure permissions
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
