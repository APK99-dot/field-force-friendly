

# Replicate QuickApp Database Schema and UI Theme in Bharath Builders

## Overview

This plan replicates the complete database schema from the **Staging - QuickApp** project into Bharath Builders, sets up Supabase Cloud, applies the exact same KVP Corporate color theme, and builds working admin sections (User Management, Attendance Management, Expense Management, Security & Access, Company Profile).

---

## Phase 1: Enable Supabase Cloud and Apply Color Theme

### 1.1 Enable Lovable Cloud
- Connect Supabase to the project for database, auth, storage, and edge functions

### 1.2 Apply QuickApp's KVP Corporate Color Theme
Update `src/index.css` to match QuickApp's exact design tokens:

- **Primary**: `220 39% 11%` (navy blue) instead of current `220 70% 35%`
- **Accent Gold**: Add `--accent-gold: 35 65% 55%` and `--accent-bronze: 30 45% 65%`
- **Gradient Hero**: `linear-gradient(135deg, hsl(220 39% 11%) 0%, hsl(220 30% 20%) 35%, hsl(30 45% 65%) 100%)`
- **Font**: Switch from Plus Jakarta Sans to Inter
- **Shadows**: Match QuickApp's `--shadow-card`, `--shadow-button`, `--shadow-hero`
- **Dark mode**: Replicate QuickApp's dark mode tokens exactly
- Add safe-area CSS utilities for mobile (Capacitor-ready)
- Add scrollbar styling utilities

Update `tailwind.config.ts` to include the new accent-gold/bronze colors and font family.

---

## Phase 2: Core Database Schema (Migrations)

### 2.1 Foundation Tables

**Migration 1: Roles and Profiles**
```text
- app_role ENUM ('admin', 'user')
- user_roles (id, user_id, role, assigned_at) with UNIQUE(user_id, role)
- profiles (id -> auth.users, username, full_name, phone_number, recovery_email, hint_question, hint_answer, profile_picture_url, user_status)
- has_role() SECURITY DEFINER function
- get_user_role() SECURITY DEFINER function
- handle_new_user() trigger: creates profile + assigns 'user' role
- RLS: users see own profile; admins see all roles
```

**Migration 2: Employees**
```text
- employee_doc_type ENUM ('address_proof', 'id_proof', 'other')
- employees (user_id -> auth.users, monthly_salary, daily_da_allowance, manager_id, hq, date_of_joining, date_of_exit, alternate_email, address, education, emergency_contact_number, photo_url, band, secondary_manager_id)
- employee_documents (id, user_id, doc_type, file_path, file_name, content_type, uploaded_by)
- Storage buckets: employee-photos, employee-docs
- RLS: admins manage all, users view own
```

### 2.2 Attendance and Leave Tables

**Migration 3: Attendance & Leave**
```text
- attendance (id, user_id, check_in_time, check_out_time, check_in_location JSONB, check_out_location JSONB, check_in_photo_url, check_out_photo_url, status, total_hours, date)
- holidays (id, date, holiday_name, description, year, created_by)
- leave_types (id, name, description, max_days, is_active)
- leave_balance (id, user_id, leave_type_id, opening_balance, used_balance, remaining_balance GENERATED, year)
- leave_applications (id, user_id, leave_type_id, from_date, to_date, total_days, reason, status, approved_by, approved_at)
- regularization_requests (id, user_id, date, request_type, reason, status, approved_by)
- Storage bucket: attendance-photos
- RLS: users see own data; admins manage all
- Triggers: leave balance deduction on application, restore on rejection
```

### 2.3 Visits and Retailers

**Migration 4: Visits, Retailers, Beats**
```text
- retailers (id, user_id, beat_id, name, address, phone, category, priority, latitude, longitude, last_visit_date, order_value, status, notes, location_tag, retail_type, potential)
- beat_plans (id, user_id, plan_date, beat_id, beat_name, beat_data JSONB)
- visits (id, user_id, retailer_id, planned_date, status, check_in_time, check_in_location JSONB, check_in_photo_url, location_match_in, check_out_time, check_out_location JSONB, check_out_photo_url, location_match_out)
- orders (id, user_id, visit_id, retailer_name, subtotal, discount_amount, total_amount, status)
- order_items (id, order_id, product_id, product_name, category, rate, unit, quantity, total)
- Storage bucket: visit-photos
- RLS: users see own data
```

### 2.4 Expenses

**Migration 5: Expenses**
```text
- additional_expenses (id, user_id, expense_date, category, custom_category, amount, description, bill_url)
- expense_master_config (id, ta_type, fixed_ta_amount, da_type, fixed_da_amount)
- beat_allowances (id, beat_id, beat_name, ta_amount, da_amount)
- Storage bucket: expense-bills
- RLS: users see own data; admins manage config
```

### 2.5 GPS Tracking

**Migration 6: GPS Tracking**
```text
- gps_tracking (id, user_id, latitude DECIMAL(10,8), longitude DECIMAL(11,8), accuracy, timestamp, date, speed, heading)
- gps_tracking_stops (id, user_id, latitude, longitude, reason, duration_minutes, timestamp)
- Indexes on (user_id, date) and (timestamp)
- RLS: users see own; admins see all
- Enable realtime on gps_tracking
```

### 2.6 Security & Access (RBAC)

**Migration 7: Security Profiles and Permissions**
```text
- security_profiles (id, name, description, is_system)
- user_profiles (id, user_id -> auth.users, profile_id -> security_profiles) UNIQUE(user_id)
- profile_object_permissions (id, profile_id, object_name, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all) UNIQUE(profile_id, object_name)
- get_subordinate_users() recursive CTE function
- can_access_object() permission check function
- Default profiles: System Administrator, Sales Manager, Field Sales Executive, Data Viewer
- Default permissions per profile for: retailers, orders, visits, products, territories, attendance, expenses, beats, distributors, invoices
- RLS: anyone can view profiles; admins manage all
```

### 2.7 Products and Schemes

**Migration 8: Products**
```text
- product_categories (id, name, description)
- products (id, sku, name, description, category_id, rate, unit, closing_stock, is_active, product_number)
- product_schemes (id, product_id, name, description, scheme_type, condition_quantity, discount_percentage, discount_amount, free_quantity, is_active, start_date, end_date)
- RLS: authenticated users can view; admins manage
```

### 2.8 Activity Events and Company Profile

**Migration 9: Supporting Tables**
```text
- activity_events (id, user_id, activity_type, activity_name, activity_date, duration_type, start_time, end_time, from_date, to_date, total_days, half_day_type, remarks, retailer_id, visit_id)
- company_profile (id, company_name, address, phone, email, logo_url, bank_name, bank_account, bank_ifsc, gst_number, pan_number)
- update_updated_at_column() trigger function
```

---

## Phase 3: Auth Integration

### 3.1 Auth Hook and Context
- Create `src/hooks/useAuth.ts` - wraps `supabase.auth.onAuthStateChange` and `getSession`
- Create `src/hooks/useAdminAccess.ts` - checks `user_roles` and `profile_object_permissions` for admin path access
- Create `src/integrations/supabase/client.ts` - Supabase client initialization

### 3.2 Auth Page Update
- Update `src/pages/Auth.tsx` to use real Supabase auth with email/password login and signup
- Include fields: username, full_name, phone_number, hint_question, hint_answer
- Role-based redirect after login: admins to /admin-controls, users to /dashboard

### 3.3 Protected Routes
- Create `src/components/ProtectedRoute.tsx` wrapping authenticated routes
- Update `App.tsx` routes to use ProtectedRoute

---

## Phase 4: Working Admin Sections

### 4.1 User Management (`/admin#users`)
**Files to create:**
- `src/pages/AdminDashboard.tsx` - Tabbed admin panel with Users, Create User, Hierarchy, Roles tabs
- `src/components/admin/CreateUserForm.tsx` - Full user creation wizard with fields: email, password, username, full_name, phone_number, manager_id, security_profile_id, salary, DA, HQ, date_of_joining, address, education, emergency_contact, document uploads
- `src/components/admin/EditUserDialog.tsx` - Edit user details dialog
- `src/components/admin/UserHierarchy.tsx` - Org chart tree with collapsible vertical list and horizontal tree view, avatars with role-colored rings
- `src/components/admin/UserDetailSheet.tsx` - Slide-over sheet showing full user details
- `src/components/admin/UserPhotoDialog.tsx` - Photo upload/change dialog

**Features:**
- Sortable, filterable user table with configurable columns (photo, username, email, role, manager, active status)
- Search by name/email/username
- Role assignment via security profiles
- Manager assignment via searchable combobox
- User status toggle (active/inactive)
- "Login as User" button (admin impersonation)
- Password reset functionality

### 4.2 Attendance Management (`/attendance-management`)
**Files to create:**
- `src/pages/AttendanceManagement.tsx`
- `src/components/admin/AttendanceOverview.tsx`

**Features:**
- Team attendance overview with daily/weekly/monthly filters
- Holiday calendar management (CRUD holidays)
- Leave type configuration
- Leave balance tracking per user
- Leave application approval/rejection
- Regularization request approval
- Working days configuration

### 4.3 Expense Management (`/admin-expense-management`)
**Files to create:**
- `src/pages/AdminExpenseManagement.tsx`

**Features:**
- Review and approve/reject expense claims
- Configure expense policies (TA type: fixed/from_beat, DA settings)
- Beat allowance configuration
- User/team/period filters
- Dashboard with pending/approved/rejected counts
- Export to Excel

### 4.4 Security & Access (`/security-management`)
**Files to create:**
- `src/pages/SecurityManagement.tsx`
- `src/components/security/SecurityProfileEditor.tsx`

**Features:**
- CRUD security profiles
- Object-level permission matrix (read, create, edit, delete, view_all, modify_all)
- Assign security profiles to users
- View current permission assignments
- Default profiles: System Administrator, Sales Manager, Field Sales Executive, Data Viewer

### 4.5 Company Profile (`/company-profile`)
**Files to create:**
- `src/pages/CompanyProfile.tsx`

**Features:**
- Edit company name, address, phone, email
- Upload company logo
- Bank details (name, account, IFSC)
- GST and PAN numbers
- Header branding configuration

---

## Phase 5: Connect Field User Pages to Real Data

### 5.1 Dashboard
- Fetch real attendance status for today
- Fetch beat plan and visit counts
- Real check-in/check-out with GPS and photo

### 5.2 Attendance Page
- Real data from `attendance` table
- Check-in/check-out writes to database with location
- Calendar reads from real attendance records
- Leave application form writing to `leave_applications`
- Leave balance display from `leave_balance`

### 5.3 Visits Page
- CRUD visits from `visits` table
- Retailer search from `retailers` table
- Beat plan integration from `beat_plans`
- Order entry writing to `orders` and `order_items`

### 5.4 Expenses Page
- Read/write `additional_expenses`
- Beat allowance calculations from `beat_allowances`
- Bill photo upload to storage

### 5.5 GPS Tracking Page
- Write GPS points to `gps_tracking` table
- Read and display route history on Leaflet map
- Multi-day color-coded routes

---

## Phase 6: React Query Hooks and Services

Create data-fetching hooks in `src/hooks/`:
- `useAuth.ts` - auth state, role, profile
- `useAdminAccess.ts` - permission-based admin path access
- `useAttendance.ts` - attendance CRUD + calendar data
- `useVisits.ts` - visit CRUD + status updates
- `useExpenses.ts` - expense CRUD + summaries
- `useGPSTracking.ts` - GPS data read/write
- `useUsers.ts` - admin user management
- `useLeave.ts` - leave applications, balances
- `usePermissions.ts` - security profile and permission checks

All hooks use React Query with proper cache invalidation and optimistic updates.

---

## Technical Notes

- All tables use RLS with the `has_role()` security definer function to prevent recursion
- Roles are stored in a separate `user_roles` table (never on profiles)
- Permission checks use `can_access_object()` server-side function
- Manager hierarchy uses recursive CTE in `get_subordinate_users()`
- Leave balance uses `remaining_balance` as a generated column
- All timestamps use `timestamptz`
- All tables have `update_updated_at_column()` triggers
- Storage buckets are private with user-scoped folder policies

