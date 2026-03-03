import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PERMISSION_MODULES } from "./permissionModules";
import { HIERARCHICAL_MODULES, getItemLabel } from "./hierarchicalPermissions";
import PermissionLayerTable, { PermissionRow } from "./PermissionLayerTable";

export interface PermissionState {
  [objectName: string]: {
    canRead: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
    permissionType: string;
    parentModule: string | null;
  };
}

interface Props {
  permissions: PermissionState;
  readOnly?: boolean;
  onChange: (updated: PermissionState) => void;
}

type CrudField = "canRead" | "canCreate" | "canEdit" | "canDelete";

export default function HierarchicalPermissionEditor({ permissions, readOnly = false, onChange }: Props) {
  const toggleField = (objectName: string, field: CrudField, value: boolean) => {
    const updated = { ...permissions };
    if (updated[objectName]) {
      updated[objectName] = { ...updated[objectName], [field]: value };
    }
    onChange(updated);
  };

  const toggleAll = (objectName: string, value: boolean) => {
    const updated = { ...permissions };
    if (updated[objectName]) {
      updated[objectName] = {
        ...updated[objectName],
        canRead: value,
        canCreate: value,
        canEdit: value,
        canDelete: value,
      };
    }
    onChange(updated);
  };

  const cascadeModuleToggle = (objectName: string, field: CrudField, value: boolean) => {
    const updated = { ...permissions };
    if (updated[objectName]) {
      updated[objectName] = { ...updated[objectName], [field]: value };
    }
    // Cascade to all children
    Object.keys(updated).forEach((key) => {
      if (updated[key].parentModule === objectName) {
        updated[key] = { ...updated[key], [field]: value };
      }
    });
    onChange(updated);
  };

  const cascadeModuleToggleAll = (objectName: string, value: boolean) => {
    const updated = { ...permissions };
    const setAll = (key: string) => {
      updated[key] = {
        ...updated[key],
        canRead: value,
        canCreate: value,
        canEdit: value,
        canDelete: value,
      };
    };
    if (updated[objectName]) setAll(objectName);
    Object.keys(updated).forEach((key) => {
      if (updated[key].parentModule === objectName) setAll(key);
    });
    onChange(updated);
  };

  // Build rows for each tab
  const moduleRows: PermissionRow[] = PERMISSION_MODULES.map((m) => {
    const p = permissions[m.name];
    return {
      objectName: m.name,
      label: m.label,
      canRead: p?.canRead ?? false,
      canCreate: p?.canCreate ?? false,
      canEdit: p?.canEdit ?? false,
      canDelete: p?.canDelete ?? false,
    };
  });

  const buildLayerRows = (layer: "fields" | "actions" | "widgets"): PermissionRow[] => {
    const rows: PermissionRow[] = [];
    for (const mod of HIERARCHICAL_MODULES) {
      for (const item of mod[layer]) {
        const p = permissions[item.name];
        rows.push({
          objectName: item.name,
          label: item.label,
          parentModule: mod.module,
          canRead: p?.canRead ?? false,
          canCreate: p?.canCreate ?? false,
          canEdit: p?.canEdit ?? false,
          canDelete: p?.canDelete ?? false,
        });
      }
    }
    return rows;
  };

  const groupLabels: Record<string, string> = {};
  HIERARCHICAL_MODULES.forEach((m) => {
    groupLabels[m.module] = m.label;
  });

  return (
    <Tabs defaultValue="modules" className="w-full">
      <TabsList className="bg-transparent border-b border-border rounded-none w-full justify-start h-auto p-0 gap-0">
        {["modules", "fields", "actions", "widgets"].map((tab) => (
          <TabsTrigger
            key={tab}
            value={tab}
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2 text-sm capitalize text-muted-foreground data-[state=active]:text-foreground"
          >
            {tab === "modules" ? "Module Permission" : `${tab.charAt(0).toUpperCase() + tab.slice(1).replace(/s$/, "")} Permission`}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="modules" className="mt-4">
        <PermissionLayerTable
          rows={moduleRows}
          readOnly={readOnly}
          onToggle={(name, field, value) => cascadeModuleToggle(name, field, value)}
          onToggleAll={(name, value) => cascadeModuleToggleAll(name, value)}
        />
      </TabsContent>

      <TabsContent value="fields" className="mt-4">
        <PermissionLayerTable
          rows={buildLayerRows("fields")}
          grouped
          groupLabels={groupLabels}
          readOnly={readOnly}
          onToggle={toggleField}
          onToggleAll={toggleAll}
        />
      </TabsContent>

      <TabsContent value="actions" className="mt-4">
        <PermissionLayerTable
          rows={buildLayerRows("actions")}
          grouped
          groupLabels={groupLabels}
          readOnly={readOnly}
          onToggle={toggleField}
          onToggleAll={toggleAll}
        />
      </TabsContent>

      <TabsContent value="widgets" className="mt-4">
        <PermissionLayerTable
          rows={buildLayerRows("widgets")}
          grouped
          groupLabels={groupLabels}
          readOnly={readOnly}
          onToggle={toggleField}
          onToggleAll={toggleAll}
        />
      </TabsContent>
    </Tabs>
  );
}
