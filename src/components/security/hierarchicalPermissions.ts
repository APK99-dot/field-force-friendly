export interface HierarchicalItem {
  name: string;
  label: string;
}

export interface HierarchicalModule {
  module: string;
  label: string;
  fields: HierarchicalItem[];
  actions: HierarchicalItem[];
  widgets: HierarchicalItem[];
}

export const HIERARCHICAL_MODULES: HierarchicalModule[] = [
  {
    module: "module_admin_panel",
    label: "Admin Panel",
    fields: [
      { name: "field_admin_dashboard", label: "Dashboard" },
      { name: "field_admin_user_management", label: "User Management" },
      { name: "field_admin_attendance_mgmt", label: "Attendance Management" },
      { name: "field_admin_expense_mgmt", label: "Expense Management" },
      { name: "field_admin_gps_tracking", label: "GPS Tracking" },
      { name: "field_admin_security_access", label: "Security & Access" },
      { name: "field_admin_company_profile", label: "Company Profile" },
    ],
    actions: [
      { name: "action_admin_create_user", label: "Create User" },
      { name: "action_admin_edit_user", label: "Edit User" },
      { name: "action_admin_delete_user", label: "Delete User" },
      { name: "action_admin_manage_holidays", label: "Manage Holidays" },
      { name: "action_admin_manage_leave_types", label: "Manage Leave Types" },
      { name: "action_admin_approve_expense", label: "Approve Expense" },
      { name: "action_admin_manage_profiles", label: "Manage Security Profiles" },
    ],
    widgets: [
      { name: "widget_admin_user_list", label: "User List Widget" },
      { name: "widget_admin_attendance_overview", label: "Attendance Overview Widget" },
      { name: "widget_admin_expense_summary", label: "Expense Summary Widget" },
    ],
  },
  {
    module: "module_attendance",
    label: "Attendance",
    fields: [
      { name: "field_attendance_check_in_time", label: "Check-in Time" },
      { name: "field_attendance_check_out_time", label: "Check-out Time" },
      { name: "field_attendance_total_hours", label: "Total Hours" },
      { name: "field_attendance_location", label: "Location" },
      { name: "field_attendance_photo", label: "Photo" },
      { name: "field_attendance_face_verification", label: "Face Verification" },
    ],
    actions: [
      { name: "action_attendance_check_in", label: "Check In" },
      { name: "action_attendance_check_out", label: "Check Out" },
      { name: "action_attendance_regularize", label: "Request Regularization" },
    ],
    widgets: [
      { name: "widget_attendance_calendar", label: "Attendance Calendar" },
      { name: "widget_attendance_records_table", label: "Attendance Records Table" },
      { name: "widget_attendance_summary_cards", label: "Summary Cards" },
    ],
  },
  {
    module: "module_activities",
    label: "Activities",
    fields: [
      { name: "field_activity_name", label: "Activity Name" },
      { name: "field_activity_type", label: "Activity Type" },
      { name: "field_activity_duration", label: "Duration" },
      { name: "field_activity_location", label: "Location" },
      { name: "field_activity_attachments", label: "Attachments" },
    ],
    actions: [
      { name: "action_activity_log", label: "Log Activity" },
      { name: "action_activity_manage_types", label: "Manage Activity Types" },
    ],
    widgets: [
      { name: "widget_activity_list", label: "Activity List" },
      { name: "widget_activity_summary", label: "Activity Summary" },
    ],
  },
];
];

// Helper functions
export function getModuleByName(moduleName: string): HierarchicalModule | undefined {
  return HIERARCHICAL_MODULES.find((m) => m.module === moduleName);
}

export function getAllFieldNames(): string[] {
  return HIERARCHICAL_MODULES.flatMap((m) => m.fields.map((f) => f.name));
}

export function getAllActionNames(): string[] {
  return HIERARCHICAL_MODULES.flatMap((m) => m.actions.map((a) => a.name));
}

export function getAllWidgetNames(): string[] {
  return HIERARCHICAL_MODULES.flatMap((m) => m.widgets.map((w) => w.name));
}

export function getPermissionType(itemName: string): "module" | "field" | "action" | "widget" {
  if (itemName.startsWith("module_")) return "module";
  if (itemName.startsWith("field_")) return "field";
  if (itemName.startsWith("action_")) return "action";
  if (itemName.startsWith("widget_")) return "widget";
  return "module";
}

export function getParentModule(itemName: string): string | null {
  for (const mod of HIERARCHICAL_MODULES) {
    if (mod.fields.some((f) => f.name === itemName)) return mod.module;
    if (mod.actions.some((a) => a.name === itemName)) return mod.module;
    if (mod.widgets.some((w) => w.name === itemName)) return mod.module;
  }
  return null;
}

export function getItemLabel(itemName: string): string {
  for (const mod of HIERARCHICAL_MODULES) {
    if (mod.module === itemName) return mod.label;
    const field = mod.fields.find((f) => f.name === itemName);
    if (field) return field.label;
    const action = mod.actions.find((a) => a.name === itemName);
    if (action) return action.label;
    const widget = mod.widgets.find((w) => w.name === itemName);
    if (widget) return widget.label;
  }
  return itemName;
}
