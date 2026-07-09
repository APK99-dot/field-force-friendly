import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { APP_MODULES } from "@/config/appModules";

export interface PermissionDefinition {
  id: string;
  name: string;
  label: string;
  type: "module" | "field" | "action" | "widget";
  parent_module: string | null;
  sort_order: number;
  is_active: boolean;
}

// The set of modules is driven entirely by the code registry (APP_MODULES),
// so adding/removing a module there automatically syncs it into the
// permission matrix without needing a database change.
function buildModuleDefinitions(): PermissionDefinition[] {
  return APP_MODULES.map((m) => ({
    id: `module:${m.name}`,
    name: m.name,
    label: m.label,
    type: "module" as const,
    parent_module: null,
    sort_order: m.sort_order,
    is_active: true,
  }));
}

export function usePermissionDefinitions() {
  return useQuery({
    queryKey: ["permission-definitions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("permission_definitions")
        .select("id, name, label, type, parent_module, sort_order, is_active")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;

      // Keep field/action/widget definitions from the DB, but replace the
      // module list with the canonical code registry (single source of truth).
      const nonModules = (data || []).filter(
        (d) => d.type !== "module"
      ) as PermissionDefinition[];

      return [...buildModuleDefinitions(), ...nonModules];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function getModules(defs: PermissionDefinition[]) {
  return defs.filter((d) => d.type === "module");
}

export function getFieldsForModule(defs: PermissionDefinition[], moduleName: string) {
  return defs.filter((d) => d.type === "field" && d.parent_module === moduleName);
}

export function getActionsForModule(defs: PermissionDefinition[], moduleName: string) {
  return defs.filter((d) => d.type === "action" && d.parent_module === moduleName);
}

export function getWidgetsForModule(defs: PermissionDefinition[], moduleName: string) {
  return defs.filter((d) => d.type === "widget" && d.parent_module === moduleName);
}

export function getByType(defs: PermissionDefinition[], type: "module" | "field" | "action" | "widget") {
  return defs.filter((d) => d.type === type);
}

export function getModuleLabel(defs: PermissionDefinition[], moduleName: string): string {
  return defs.find((d) => d.name === moduleName)?.label || moduleName;
}
