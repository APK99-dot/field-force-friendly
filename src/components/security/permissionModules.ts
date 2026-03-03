export interface PermissionModule {
  id: string;
  name: string;
  label: string;
}

// Top-level modules for Bharath Builders
export const PERMISSION_MODULES: PermissionModule[] = [
  { id: "module_admin_panel", name: "module_admin_panel", label: "Admin Panel" },
  { id: "module_attendance", name: "module_attendance", label: "Attendance" },
  { id: "module_activities", name: "module_activities", label: "Activities" },
  { id: "module_expenses", name: "module_expenses", label: "Expenses" },
  { id: "module_projects", name: "module_projects", label: "Projects" },
  { id: "module_gps_tracking", name: "module_gps_tracking", label: "GPS Tracking" },
  { id: "module_leaves", name: "module_leaves", label: "Leaves" },
];

// Admin sub-module path map
export const ADMIN_MODULE_PATH_MAP: Record<string, string> = {
  admin_dashboard: "/admin",
  admin_user_management: "/admin-user-management",
  admin_attendance_mgmt: "/attendance-management",
  admin_expense_mgmt: "/admin-expense-management",
  admin_gps_track_mgmt: "/gps-tracking",
  admin_security_access: "/admin/security",
  admin_company_profile: "/company-profile",
};

export function getAllModuleNames(): string[] {
  return PERMISSION_MODULES.map((m) => m.name);
}
