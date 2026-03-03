

## Link Attendance Management to User Management (Real Users)

### Problem
The Attendance Management module fetches employee data from the `profiles` table (10 entries), but the actual managed users live in the `users` table (5 entries). This means the attendance module shows stale/unmanaged users that don't appear in User Management, and the data is disconnected.

### Solution
Update all attendance management components to source their user lists from the `users` table (filtered by `is_active = true`) instead of the `profiles` table. This ensures only actively managed employees appear across the attendance module.

### Files to Change

**1. `src/components/LiveAttendanceMonitoring.tsx`**
- Change `fetchUsers()` to query `users` table (`id, full_name, username`) with `is_active = true` instead of `profiles`
- Change `fetchAttendanceData()` to query `users` table for the "all users" list used to determine absent employees
- This ensures the KPI cards (Total Employees, Present, Absent) reflect only managed users

**2. `src/components/attendance/LeaveBalancesManager.tsx`**
- Change `fetchData()` to query `users` table (`id, full_name`) with `is_active = true` instead of `profiles`
- Update the enrichment mapping to use users table data
- Update `handleInitializeBalances()` to query active users from `users` table instead of filtering `profiles` by `user_status`

**3. `src/pages/AttendanceManagement.tsx`**
- Change `fetchUsers()` to query `users` table (`id, full_name`) with `is_active = true` instead of `profiles`
- This fixes the Leave Management and Regularization user filter dropdowns

### Technical Details

Each component currently does:
```typescript
// OLD - queries profiles (10 rows, includes unmanaged users)
const { data } = await supabase.from('profiles').select('id, full_name, username').order('full_name');
```

Will be changed to:
```typescript
// NEW - queries users (only actively managed employees)
const { data } = await supabase.from('users').select('id, full_name, username').eq('is_active', true).order('full_name');
```

The attendance enrichment (joining user names to attendance records) will also switch from `profiles` to `users`, keeping the same field names (`full_name`, `username`) so no downstream UI changes are needed.

### Impact
- Live Attendance will show exactly the 5 managed users
- Leave Balances will initialize/display for managed users only
- Leave Management and Regularization filters will list managed users only
- Absent employee detection will be accurate (based on managed headcount)

