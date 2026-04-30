# Make "My Team" Attendance Available to All Users

## Goal
Every authenticated user — not just admins or managers with subordinates — should see the **My Team** tab on the Attendance page, and that tab should display today's attendance for **all active users in the organization**. Layout, columns, stats and dialog must remain identical to the current view.

## Current Behavior (to change)

1. **`src/pages/Attendance.tsx`** — the `My Attendance / My Team` toggle is rendered only when `hasTeam === true`. `hasTeam` is set by calling `get_user_hierarchy` and checking that the user has subordinates.
2. **`src/components/attendance/MyTeamAttendance.tsx`** — fetches only subordinates via `get_user_hierarchy`, then renders a hierarchical tree grouped by `reporting_manager_id`.

## Changes

### 1. `src/pages/Attendance.tsx`
- Remove the `hasTeam` gate around the toggle bar so the **My Team** segmented control is always visible.
- Remove the `&& hasTeam` condition on the team view render: `activeView === "team"` alone decides.
- Drop the `hasTeam` state and the `get_user_hierarchy` call inside the initial `useEffect` (no longer needed for visibility).
- Keep `activeView` default as `"my"` so users still land on their own attendance.

### 2. `src/components/attendance/MyTeamAttendance.tsx`
Switch from "subordinates only" to "all active users", while keeping the same UI:

- **Data source**: Replace the `supabase.rpc("get_user_hierarchy", …)` call with a single query:
  ```ts
  supabase.from("users")
    .select("id, full_name, username, reporting_manager_id")
    .eq("is_active", true)
    .order("full_name");
  ```
- **Today's attendance & approved leaves**: keep the same two follow-up queries, but no longer filter by `subIds` — simply scope by `date = today` and the leave window. (Postgres will return only the rows for today, so payload stays small.)
- **Rendering mode**: the existing hierarchical tree (`directReports` + expand/collapse children) only makes sense for managers. For an org-wide list we will switch to a **flat alphabetical list** that reuses the exact same row component (`renderMemberRow`) — same avatar, name, check-in time, status badge, eye-icon detail button. The only thing dropped is the indent / chevron expand affordance (since there is no manager-subordinate context for a normal user). Stats cards (Present / On Leave / Absent), search box, "Generate Report" button, and the member-detail dialog remain unchanged.
- **Empty state**: keep the existing "No team members found" block, but it will essentially never trigger now.

### 3. Performance
- Single `users` SELECT (one row per active user, ~hundreds at most) + one `attendance` SELECT for today + one `leave_applications` SELECT for today. All three already have indexes on `user_id` / `date`.
- Add a basic React Query / `staleTime` style guard? Not required — the component already manages its own state and the data is light. We will add a simple in-memory guard so the data is only refetched when the tab is actually opened (mount stays as-is, which is already lazy because `MyTeamAttendance` is only rendered when `activeView === "team"`).
- Search filtering stays client-side over the already-fetched list.

### 4. Admin / existing functionality
- No changes to the admin Attendance Management page, report generator, or pending approvals.
- `TeamAttendanceReportGenerator` keeps working — it is launched from the same button, unaffected by the data-source change in the listing.
- RLS: confirm that the `users`, `attendance`, and `leave_applications` tables allow non-admin users to read these rows. If today's RLS restricts non-admins to their own/subordinates' rows, we will add (or relax) a policy to allow any authenticated user to `SELECT` the minimal columns needed (`id, full_name, username, reporting_manager_id, is_active` on `users`; `user_id, date, check_in_time, check_out_time, status, total_hours` on `attendance` for today; `user_id, from_date, to_date, status` on `leave_applications`). I'll check the current policies before applying and only add the migration if necessary.

## Files to Modify
- `src/pages/Attendance.tsx` — drop `hasTeam` gate, always show toggle.
- `src/components/attendance/MyTeamAttendance.tsx` — fetch all active users, render flat list, keep stats/search/dialog identical.
- Possibly a new Supabase migration adding/relaxing SELECT policies on `users`, `attendance`, and `leave_applications` so every authenticated user can read the rows the page needs (added only if existing RLS blocks it).

## Out of Scope
- No change to "My Attendance" view, check-in/out flow, calendar, leave logic, or admin pages.
- No change to the report generator UI.
