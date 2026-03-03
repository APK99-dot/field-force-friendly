

## Plan: Hierarchy-Based Leave Visibility in Attendance Management

### Problem
The `AttendanceManagement.tsx` page fetches **all** leave applications with `select("*")`, relying on RLS. Since this is an admin page, users accessing it (even non-super-admins with just attendance management permission) can see leave requests from employees who don't report to them.

The `PendingApprovals.tsx` page already correctly filters by `reporting_manager_id` — we need to apply the same pattern to `AttendanceManagement.tsx`.

### Changes — Single File: `src/pages/AttendanceManagement.tsx`

**1. Determine user role on mount**
- Fetch current user's ID and check `user_roles` table for admin role
- Store `isAdmin` and `currentUserId` in state

**2. Fix `fetchLeaveApplications`**
- If admin → fetch all (current behavior)
- If not admin → first get subordinate IDs via `users.reporting_manager_id = currentUserId`, then filter `.in("user_id", subIds)`
- If no subordinates, return empty

**3. Fix `fetchRegularizationRequests`**
- Same hierarchy filter as leaves

**4. Fix `fetchUsers` dropdown**
- Admin → show all users
- Manager → show only subordinates in the filter dropdown

**5. Hide Approve/Reject actions**
- Only show action buttons when the leave applicant is a direct/indirect subordinate of the current user, or user is admin

No database changes needed — RLS is already correctly configured. This is a client-side filtering fix to match the hierarchy.

