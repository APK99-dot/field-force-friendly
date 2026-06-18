# Attendance & Workforce Overview on Dashboard

Add a new section to the Dashboard, visible only to users whose Security & Access profile grants the existing **Attendance Overview Widget** permission (`widget_admin_attendance_overview`). Users with no profile (legacy/system admins) keep full access by default, matching the current permission model.

## What the user sees

A new card section below the existing Overview grid containing:

1. **Filter bar** (top) with a "Filters" control to scope data by:
   - Users (multi-select of active employees)
   - This Week / Last Week / This Month
   - Custom Date Range (start + end date)

2. **Attendance table** showing one row per employee per day in range:
   - Employee Name
   - Check-In Time
   - Check-Out Time
   - Active Hours

3. **Monthly calendar** below the table. Each date cell lists that day's activity entries, each showing:
   - Employee Name
   - Assigned Site
   - Activity Status badge (Planned / In Progress / Completed)

The selected filters (users + date range) apply to **both** the attendance table and the calendar.

## Permission gating

- Use `useProfilePermissions().hasWidgetPermission("widget_admin_attendance_overview")`.
- The whole section renders only when this returns true.
- This permission already exists in the permission catalog under the Admin Panel module, so it appears automatically in the Security & Access editor for admins to toggle per profile. No DB migration needed.

## Data sources

- **Attendance**: `attendance` table (user_id, date, check_in_time, check_out_time, total_hours) joined to `users` (full_name) for names. Active Hours = computed from check-in/out, falling back to `total_hours`.
- **Activities (calendar)**: `activity_events` table (user_id, activity_date, status, site_id) joined to `users` (full_name) and `project_sites` (site_name). Status maps: `planned`/`in_progress`/`completed`.
- Both queries are filtered by the selected user set and date range.

## Implementation

```text
src/
  hooks/
    useWorkforceOverview.ts      (new) - fetches attendance + activities + users
  components/
    dashboard/
      WorkforceOverviewSection.tsx   (new) - permission gate + layout
      WorkforceFilters.tsx           (new) - users + date-range filter bar
      WorkforceAttendanceTable.tsx   (new) - employee/check-in/out/hours table
      WorkforceActivityCalendar.tsx  (new) - monthly grid with per-day entries
  pages/
    Dashboard.tsx                (edit) - render <WorkforceOverviewSection/>
```

### Technical details

- **`useWorkforceOverview(filters)`**: TanStack Query hook accepting `{ userIds: string[]; start: string; end: string }`. Returns active users (for the filter dropdown), attendance rows, and activity rows in range. Date presets resolved with `date-fns` (`startOfWeek`/`endOfWeek`, previous week, `startOfMonth`/`endOfMonth`).
- **WorkforceFilters**: a "Filters" button opening a popover/sheet with a preset Select (This Week / Last Week / This Month / Custom), a custom date-range pair (shown when Custom), and a multi-select user picker. Default preset: This Week, all users.
- **WorkforceAttendanceTable**: renders filtered attendance with formatted times (`h:mm a`) and Active Hours (`x.xh`); reuses status/styling conventions from `LiveAttendanceMonitoring`.
- **WorkforceActivityCalendar**: builds a month grid for the month of the selected range (anchored to range start). Each cell groups `activity_events` by `activity_date` and renders compact rows of Employee Name · Site · status Badge. Uses semantic color tokens for status badges, scrollable cell content when busy.
- Mobile-first and responsive, consistent with existing Dashboard cards and design tokens (no hardcoded colors).

## Out of scope

- No new database tables, columns, or migrations.
- No changes to how activities or attendance are created.
- Export/PDF of this section (existing admin pages already cover exports).
