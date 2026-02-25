

# Plan: Copy Attendance Module Exactly from Staging – QuickApp

After a thorough line-by-line comparison between the staging project and the current implementation, the current versions are already functionally close but have significant UI and feature gaps versus the staging originals. Below is the exact list of changes needed.

---

## Current State vs Staging — Gap Analysis

### `AttendanceManagement.tsx` (Admin Page)

| Feature | Staging | Current | Gap |
|---|---|---|---|
| Tab style | Custom button tabs with icons (pill-style, scrollable) | Radix TabsList (wrapped, no icons) | Needs rewrite to button tabs |
| User filter dropdown | On Leave & Regularization tabs, filters by employee | Missing | Add |
| Leave table columns | Employee, Leave Type, Start Date, End Date, Reason, Applied Date, Status, Actions | Employee, Type, From, To, Days, Status, Actions | Missing Reason, Applied Date columns; column labels differ |
| Leave date columns | Uses `start_date`/`end_date` | Uses `from_date`/`to_date` | Need to use `from_date`/`to_date` (correct for our schema) |
| Regularization total_hours calc | Calculates total_hours on approval; uses upsert with `onConflict: 'user_id,date'` | No total_hours calc; uses manual check + insert/update | Upgrade logic |
| Regularization adds `notes` field | `Regularized via request #xxx` | No notes | Add |
| Data fetching pattern | useState + useEffect with manual fetch | React Query | Keep React Query (improvement over staging) |

### `Attendance.tsx` (User Page)

| Feature | Staging | Current | Gap |
|---|---|---|---|
| Summary cards | 2 cards: Attendance %, Present/Total | 3 cards: Attendance %, Present, Absent | Match staging layout |
| Present/Absent clickable dialogs | Click card to see list of dates | Missing | Add |
| Market Hours | Full Card with 3 columns: First Check In, Active Market Hours, Last Check Out | Compact single-row card | Rewrite to match staging |
| Attendance history list | Scrollable list of records with status badges, regularization button per record, date filter | Missing (only calendar view) | Add as "My Attendance" tab |
| Tab structure | 3 tabs: My Attendance (history list), Leave (balances + applications), Holiday (list) | 3 tabs: Calendar, Leaves, Applications | Restructure to match staging |
| Calendar view | Inside "My Attendance" section above the history list, with present/absent summary cards | Standalone tab | Move to above history |
| Date filter | Select: This Month / Last Month | None | Add |
| Manager "My Team" tab | Segmented control for managers | Missing | Skip (requires `useSubordinates` hook not ported yet) |
| GPS/Camera/Face verification | Present in staging | Already excluded per plan | No change |

### `LiveAttendanceMonitoring.tsx`

| Feature | Staging | Current | Gap |
|---|---|---|---|
| User checkbox selection | Multi-select user filter with checkboxes | Missing | Add |
| Face match badges | Columns for face verification confidence | Missing | Skip (face verification not ported) |
| Visit data columns | First/Last visit check-in columns | Missing | Skip (visit-specific, different scope) |
| AttendanceDetailsDialog | Click summary cards to see details | Missing | Skip for now |
| Real-time subscription | Subscribes to attendance table changes | Already implemented | No change |

---

## Changes to Implement

### 1. Rewrite `AttendanceManagement.tsx`

Port the staging version's UI exactly:
- Custom button tabs (scrollable, pill-style with icons) instead of Radix Tabs
- Add user filter dropdown on Leave and Regularization tabs
- Add "Reason" and "Applied Date" columns to leave table
- Use `from_date`/`to_date` column names (matching our schema)
- Upgrade regularization approval: calculate `total_hours`, use `upsert` with `onConflict`, add `notes` field
- Use separate profile/leave-type fetch + manual join pattern (matching staging's approach)
- Use `useState` + `useEffect` fetch pattern to match staging exactly

### 2. Rewrite `Attendance.tsx`

Port the staging version's UI:
- 2-card summary layout (Attendance %, Present/Total) instead of 3-card
- Clickable Present/Absent cards that open Dialog with date lists
- Market Hours as full 3-column Card (First Check In, Active Market Hours, Last Check Out)
- Restructure tabs to: My Attendance (calendar + history list), Leave (balances + applications), Holiday
- Add attendance history list with per-record regularization buttons, status badges, date info
- Add date filter (This Month / Last Month) on the history list
- Keep existing check-in/check-out logic unchanged

### 3. Minor updates to `LiveAttendanceMonitoring.tsx`

- Add user checkbox multi-select filter (matching staging)
- Keep existing summary cards and table structure (already close to staging)

---

## Files Modified

1. `src/pages/AttendanceManagement.tsx` — Complete rewrite to match staging UI/logic
2. `src/pages/Attendance.tsx` — Complete rewrite to match staging UI/logic  
3. `src/components/LiveAttendanceMonitoring.tsx` — Add user checkbox filter

## Files NOT Changed

- `src/hooks/useAttendance.ts` — Already functional, no changes needed
- `src/components/attendance/AttendanceCalendarView.tsx` — Already matches staging
- `src/components/RegularizationRequestModal.tsx` — Already matches staging
- `src/components/LeaveBalanceCards.tsx` — Already matches staging
- `src/components/MyLeaveApplications.tsx` — Already matches staging
- All admin sub-components (HolidayManagement, LeaveTypesManager, etc.) — Already ported

## Database Changes

None required — schema already has all needed columns.

## Estimated Scope

3 files modified, ~1500 lines of UI code adapted from staging with infrastructure substitutions (no i18n, no face matching, no offline storage, `from_date`/`to_date` instead of `start_date`/`end_date`).

