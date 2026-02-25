

# Plan: Replicate Attendance Module & Admin Attendance Management from Staging-QuickApp

## Overview

This plan copies the **Attendance Module** (user-facing) and **Attendance Management** (admin panel) from the Staging-QuickApp project into this project, matching the same UI, features, logic, and database schema. Since this project does not have some of the staging project's infrastructure (i18n translations, offline storage/IndexedDB, AuthProvider context, face matching edge function, van sales), those dependencies will be adapted to work with the current project's architecture while preserving all core functionality.

## What Gets Copied (Feature Parity)

**User Attendance Page:**
- Monthly attendance percentage and present/absent day counts
- Start My Day / End My Day with GPS location capture
- Calendar view with color-coded day statuses (present, absent, leave, half-day, week-off, holiday)
- Market Hours module (First Check In, Active Hours, Last Check Out)
- Leave balance cards with inline leave application
- My Leave Applications list
- Regularization request submission for absent/incorrect days
- Attendance history table with date filtering

**Admin Attendance Management Page (8 tabs):**
1. Live Attendance Monitoring (real-time employee status table with search, filters, CSV export)
2. Leave Management (approve/reject leave applications)
3. Regularization (approve/reject regularization requests with rejection reason dialog)
4. Leave Balances (view/manage employee leave balances)
5. Leave Types (CRUD for leave type configuration)
6. Holidays (CRUD for holiday management)
7. Working Days (monthly working days configuration)
8. Attendance Policy (leave entitlements, auto-deduction settings)

---

## Phase 1: Database Schema Updates

The following tables and columns need to be created or modified:

### New Tables

**`week_off_config`** -- Configures which days of the week are off
- id (uuid, PK)
- day_of_week (integer, 0=Sunday to 6=Saturday)
- is_off (boolean)
- alternate_pattern (text, nullable: 'all', '1st_3rd', '2nd_4th')
- created_at, updated_at

**`working_days_config`** -- Admin-saved monthly working day counts
- id (uuid, PK)
- year (integer)
- month (integer)
- total_days (integer)
- working_days (integer)
- week_offs (integer)
- holidays (integer)
- created_at, updated_at
- UNIQUE(year, month)

**`attendance_policy`** -- Stores attendance policy settings
- id (uuid, PK)
- policy_key (text, unique)
- policy_value (jsonb)
- created_at, updated_at

### Alter Existing Tables

**`regularization_requests`** -- Add missing columns to match staging:
- attendance_date (date) -- rename/alias from `date`
- current_check_in_time (timestamptz, nullable)
- current_check_out_time (timestamptz, nullable)
- requested_check_in_time (timestamptz, nullable)
- requested_check_out_time (timestamptz, nullable)
- approved_at (timestamptz, nullable)
- rejection_reason (text, nullable)

**`leave_applications`** -- Add missing columns:
- applied_date (timestamptz, default now())
- start_date (date) -- alias for from_date
- end_date (date) -- alias for to_date
- approved_date (timestamptz, nullable)
- is_half_day (boolean, default false)
- half_day_period (text, nullable)

**`attendance`** -- Add columns for address/face verification:
- check_in_address (text, nullable)
- check_out_address (text, nullable)
- face_verification_status (text, nullable)
- face_match_confidence (numeric, nullable)
- face_verification_status_out (text, nullable)
- face_match_confidence_out (numeric, nullable)
- notes (text, nullable)
- regularized_request_id (uuid, nullable)
- Add UNIQUE constraint on (user_id, date)

### RLS Policies

All new tables will have RLS enabled with:
- Admin full access via `has_role(auth.uid(), 'admin')`
- Users can view their own records
- `week_off_config`, `working_days_config`, `attendance_policy` are readable by all authenticated users

---

## Phase 2: Components to Create (~20 files)

### Attendance Sub-Components (`src/components/attendance/`)
1. **AttendanceCalendarView.tsx** -- Color-coded monthly calendar with leave/holiday overlay
2. **AttendancePolicyConfig.tsx** -- Admin policy configuration (leave entitlements, auto-deduction)
3. **LeaveBalancesManager.tsx** -- Admin view/edit of employee leave balances
4. **LeaveTypesManager.tsx** -- CRUD for leave types
5. **WorkingDaysConfig.tsx** -- Monthly working days configuration UI
6. **TeamAttendanceTab.tsx** -- Team attendance view for managers (adapted without deep hierarchy)
7. **TeamSummaryCards.tsx** -- Summary cards for team attendance

### Standalone Components (`src/components/`)
8. **LiveAttendanceMonitoring.tsx** -- Real-time attendance monitoring table with filters, search, CSV export
9. **HolidayManagement.tsx** -- Holiday CRUD management
10. **LeaveApplicationModal.tsx** -- Modal for applying for leave
11. **MyLeaveApplications.tsx** -- List of user's own leave applications
12. **LeaveBalanceCards.tsx** -- Compact leave balance display for user
13. **RegularizationRequestModal.tsx** -- Modal for submitting regularization requests
14. **RejectionReasonDialog.tsx** -- Dialog for entering rejection reason

### Hooks (`src/hooks/`)
15. **useWorkingDaysConfig.ts** -- Fetches week-off config, holidays, calculates working days (simplified without offline storage)
16. **useAttendance.ts** -- Updated to match staging's data patterns

---

## Phase 3: Page Rewrites

### `src/pages/Attendance.tsx` (Complete Rewrite)
Adapted from staging's 1544-line version with these modifications:
- Replace `useAuth()` with `useUserProfile()` + `supabase.auth.getUser()` pattern (current project's auth)
- Remove i18n `useTranslation` calls -- use plain English strings
- Remove `offlineStorage` / `useConnectivity` / `useAttendanceCache` -- use direct Supabase queries with React Query
- Remove `useFaceMatching` / `CameraCapture` / face verification flow -- attendance without photo/face (can be added later)
- Remove `useGPSTrackingOptimized` / `JourneyMap` / `TimelineView` -- GPS capture on check-in/out only (already works)
- Remove `useVanSales` check before checkout
- Keep: Calendar view, stats cards, Start/End Day, Market Hours, Leave Balances, Leave Applications, Regularization, Date filtering, Present/Absent day dialogs

### `src/pages/AttendanceManagement.tsx` (Complete Rewrite)
Adapted from staging's 650-line version:
- All 8 tabs (Live, Leave, Regularization, Leave Balances, Leave Types, Holidays, Working Days, Policy)
- Replace `Layout` wrapper with current project's layout (already handled by AppLayout route)
- Leave approval/rejection with status badges
- Regularization approval with rejection reason dialog
- User filtering dropdown

---

## Phase 4: Adaptation Strategy for Missing Infrastructure

| Staging Feature | Current Project Adaptation |
|---|---|
| `useAuth()` context | `supabase.auth.getUser()` + `useUserProfile()` |
| `useTranslation('common')` | Plain English strings |
| `offlineStorage` / IndexedDB | Removed; use React Query caching only |
| `useConnectivity()` | Assume always online |
| `useFaceMatching` + `CameraCapture` | Skipped; check-in/out without photo |
| `useGPSTrackingOptimized` | Existing GPS capture in `useAttendance` |
| `useVanSales` | Skipped |
| `JourneyMap` + `TimelineView` | Not included (can add later) |
| `Layout` component | Not needed (AppLayout handles it) |
| `downloadCSV` utility | Inline browser download |
| `getSignedStorageUrl` | Direct Supabase storage URL |
| `get_all_subordinates` RPC | Use existing `get_user_hierarchy` RPC |

---

## Phase 5: Routing

No routing changes needed -- `/attendance` and `/admin/attendance` routes already exist in `App.tsx`.

---

## Technical Notes

- All components will be copied with their full UI logic from staging, only changing import paths and auth patterns
- The `regularization_requests` table needs the most schema work since the staging version has fields like `attendance_date`, `current_check_in_time`, `requested_check_in_time` that the current schema lacks
- The `leave_applications` table in the current project uses `from_date`/`to_date` while staging uses `start_date`/`end_date` -- the code will be adapted to use the current column names
- Working days calculation will work without the `week_off_config` table initially by defaulting to Sunday off

## File Count Summary

- ~3 database migration files
- ~14 new component files  
- ~1 new hook file
- ~2 page rewrites
- ~1 hook update
- **Total: ~21 files**

