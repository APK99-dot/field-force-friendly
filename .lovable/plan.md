

## Plan: Replicate Staging-Quickapp Security Architecture for Bharath Builders

### What We're Building

The Staging-Quickapp project has a **4-layer hierarchical permission system** (Module → Field → Action → Widget) with cascading CRUD flags, profile-based assignment, and permission-checking hooks. Currently, Bharath Builders has a simpler flat module-level permission system. We need to upgrade it to match the Staging-Quickapp architecture while keeping only Bharath Builders' modules.

---

### Database Changes

**1. Add `permission_type` and `parent_module` columns to `profile_object_permissions`**

The Staging-Quickapp table has these additional columns to support hierarchical permissions. We need:
- `permission_type TEXT NOT NULL DEFAULT 'module'` — values: `module`, `field`, `action`, `widget`
- `parent_module TEXT` — links child items back to their parent module
- Update the unique constraint from `(profile_id, object_name)` to `(profile_id, object_name, permission_type)`

**2. Rename `user_security_profiles` to `user_profiles`** (or create a view)

Staging-Quickapp uses a table called `user_profiles` with a unique constraint on `user_id`. The current table `user_security_profiles` serves the same purpose. We'll keep the existing table but add a unique constraint on `user_id` if missing, and update code references accordingly (no rename needed — just adapt the hooks to use the existing table name).

---

### New Files to Create

**3. `src/components/security/permissionModules.ts`** — Bharath Builders module definitions

Defines the `PERMISSION_MODULES` array with only BB-relevant modules:
- Admin Panel (Dashboard, User Management, Attendance Management, Expense Management, GPS Tracking, Security & Access, Company Profile)
- Attendance (Check-in/out, Face Verification, Leave Applications, Regularization, Holidays)
- Activities (Activity Logging, Activity Types)
- Visits (Visit Planning, Visit Execution, Visit Summary)
- Beats (Beat Plans, Beat Management)
- Expenses (Beat Allowance, Additional Claims, Expense History)
- Projects (Project List, Task Management, Timesheets)
- GPS Tracking (Live Map, Journey Playback)
- Retailers (Retailer List, Add/Edit Retailer)
- Orders (Order Creation, Order History)
- Leaves (Leave Application, Leave Balance)

**4. `src/components/security/hierarchicalPermissions.ts`** — Field/Action/Widget definitions per module

Defines `HIERARCHICAL_MODULES` with fields, actions, and widgets for each BB module. Includes helper functions: `getAllModuleNames()`, `getAllFieldNames()`, `getAllActionNames()`, `getAllWidgetNames()`, `getPermissionType()`.

**5. `src/components/security/PermissionLayerTable.tsx`** — Reusable table component

Copied from Staging-Quickapp. Renders a permission table with CRUD checkboxes, supporting both flat rows (module tab) and grouped rows (field/action/widget tabs) with collapsible group headers and "All" column.

**6. `src/components/security/HierarchicalPermissionEditor.tsx`** — 4-tab editor

Copied from Staging-Quickapp. Renders tabs for Module Permission, Field Permission, Action Permission, Widget Permission. Module-level changes cascade to all children.

**7. `src/hooks/useProfilePermissions.ts`** — Permission checking hook

Adapted from Staging-Quickapp. Fetches the current user's `profile_object_permissions` via their `user_security_profiles` assignment. Provides:
- `hasPermission(objectName, permType)`
- `hasModuleAccess(featurePrefix)` 
- `hasFieldPermission()`, `hasActionPermission()`, `hasWidgetPermission()`
- `hasAnyAdminPermission`
- `permittedAdminPaths`

**8. `src/hooks/useAdminAccess.ts`** — Admin access convenience hook

Wraps `useProfilePermissions` to provide `hasAdminAccess`, `hasModuleAccess`, `permittedAdminPaths`.

---

### Files to Modify

**9. Replace `src/components/security/RolePermissionsMatrix.tsx`**

Replace the current flat switch-based matrix with the new `RolePermissionsTab` pattern:
- Profile selector dropdown at top
- Auto-select System Administrator profile
- System Administrator gets all permissions granted (read-only)
- Uses `HierarchicalPermissionEditor` for the 4-layer permission editing
- Save button that upserts all permissions with `permission_type` and `parent_module`

**10. Update `src/pages/SecurityManagement.tsx`**

Update the Role Permissions tab to use the new self-contained `RolePermissionsTab` (which has its own profile selector) instead of requiring profile selection from the Profiles tab first.

**11. Update `src/components/security/UserProfileAssignments.tsx`**

Minor: ensure it queries `user_security_profiles` consistently (already does).

---

### Technical Details

**Permission Naming Convention** (matching Staging-Quickapp):
- Modules: `module_attendance`, `module_activities`, etc.
- Fields: `field_attendance_present_days`, `field_expense_amount`, etc.
- Actions: `action_attendance_check_in`, `action_expense_submit_claim`, etc.
- Widgets: `widget_attendance_records_table`, `widget_gps_live_map`, etc.

**Admin Module Permission Map** (BB-specific):
```text
admin_dashboard       → /admin
admin_attendance_mgmt → /attendance-management
admin_expense_mgmt    → /admin-expense-management
admin_gps_track_mgmt  → /gps-tracking
admin_security_access → /admin/security
admin_company_profile → /company-profile
```

**DB Migration SQL**:
```sql
ALTER TABLE profile_object_permissions 
  ADD COLUMN IF NOT EXISTS permission_type TEXT NOT NULL DEFAULT 'module',
  ADD COLUMN IF NOT EXISTS parent_module TEXT;

ALTER TABLE profile_object_permissions 
  DROP CONSTRAINT profile_object_permissions_profile_id_object_name_key;

ALTER TABLE profile_object_permissions 
  ADD CONSTRAINT profile_object_permissions_profile_id_object_name_ptype_key 
  UNIQUE (profile_id, object_name, permission_type);
```

**Backward Compatibility**: Existing `profile_object_permissions` rows will get `permission_type = 'module'` by default, preserving current functionality. The `can_access_object` DB function still works since it doesn't filter by `permission_type`.

