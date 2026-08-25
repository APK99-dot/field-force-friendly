// Single source of truth for the application's permission-gated modules.
// Add or remove an entry here and it automatically syncs everywhere the
// module list is consumed — including the Role Permissions matrix.
//
// The `name` must be unique and stable (it is stored in
// profile_object_permissions.object_name). `label` is what users see.

export interface AppModule {
  name: string;
  label: string;
  sort_order: number;
}

export const APP_MODULES: AppModule[] = [
  { name: "module_admin_panel", label: "Admin Panel", sort_order: 1 },
  { name: "module_attendance", label: "Attendance", sort_order: 2 },
  { name: "module_activities", label: "Activities", sort_order: 3 },
  { name: "module_expenses", label: "Expenses", sort_order: 4 },
  { name: "module_gps_tracking", label: "GPS Tracking", sort_order: 5 },
  { name: "module_projects_sites", label: "Projects / Sites", sort_order: 6 },
  { name: "module_my_team", label: "My Team", sort_order: 7 },
  { name: "module_procurement", label: "Procurement", sort_order: 8 },
  { name: "module_goods_receipt", label: "Goods Receipt", sort_order: 9 },
  { name: "module_master_data", label: "Master Data", sort_order: 10 },
  { name: "module_reports", label: "Reports", sort_order: 11 },
  { name: "module_customers", label: "Customers", sort_order: 12 },
  { name: "module_leads", label: "Leads", sort_order: 13 },
  { name: "module_events", label: "Events", sort_order: 14 },
  { name: "module_opportunities", label: "Opportunities", sort_order: 15 },
  { name: "module_vendors", label: "Vendors", sort_order: 16 },
  // Navigation visibility only. Deliberately separate from module_master_data,
  // which controls who can WRITE master records — site engineers need that to
  // add products from a requisition, but should not see the master screens.
  { name: "module_vendor_master", label: "Vendor Master (screen)", sort_order: 17 },
  { name: "module_product_master", label: "Product Master (screen)", sort_order: 18 },
  { name: "module_address_book", label: "Address Book (screen)", sort_order: 19 },
];

export function getAppModuleNames(): string[] {
  return APP_MODULES.map((m) => m.name);
}
