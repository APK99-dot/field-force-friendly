

## Plan: Align Attendance Management with Staging-Quickapp Logic

### What's Different

Comparing the two projects, the current project is missing several key features and database tables that Staging-Quickapp has:

| Feature | Staging-Quickapp | Current Project |
|---------|-----------------|-----------------|
| **Reports tab** (attendance report with CSV/Excel export) | Yes — dedicated `AttendanceReportGenerator` component | Missing |
| **Leave Policy Config** (global leave policy + per-type overrides) | `LeavePolicyConfig` with `global_leave_policy` and `leave_type_policy_override` tables | Simple `AttendancePolicyConfig` with basic leave entitlements only |
| **Regularization Policy Config** (limits, backdate rules, approval mode) | `RegularizationPolicyConfig` with `regularization_policy` table | Missing |
| **Policy tab structure** | Policy tab = Leave Policy + Regularization Policy side-by-side | Policy tab = basic leave entitlements + week-off config combined |
| **Attendance statuses** | `present`, `absent`, `late`, `leave`, `half_day_leave`, `regularized` | Missing `late` and `half_day_leave` statuses |

### Database Changes Required

Three new tables need to be created:

1. **`global_leave_policy`** — Global leave rules (reset cycle, negative balance, carry forward, sandwich rule, half-day, backdated leave, notice period, max continuous days)
2. **`leave_type_policy_override`** — Per-leave-type overrides (negative balance, carry forward, custom reset cycle)
3. **`regularization_policy`** — Regularization rules (monthly/daily limits, backdate days, approval mode, post-approval impact)

### Implementation Steps

1. **Create 3 new database tables** via migration (`global_leave_policy`, `leave_type_policy_override`, `regularization_policy`) with RLS policies (admin-only write, authenticated read)

2. **Create hooks:**
   - `src/hooks/useGlobalLeavePolicy.ts` — fetch global policy + overrides + effective policy calculator
   - `src/hooks/useRegularizationPolicy.ts` — fetch regularization policy

3. **Create new components:**
   - `src/components/attendance/LeavePolicyConfig.tsx` — full global leave rules UI with per-type override accordion (replicate from Staging-Quickapp)
   - `src/components/attendance/RegularizationPolicyConfig.tsx` — regularization policy UI (replicate from Staging-Quickapp)
   - `src/components/attendance/AttendanceReportGenerator.tsx` — date-range attendance report with CSV/Excel export

4. **Refactor `AttendancePolicyConfig.tsx`** — change it to compose `LeavePolicyConfig` + `RegularizationPolicyConfig` (matching Staging-Quickapp's structure). Move the existing leave entitlements + week-off config into `WorkingDaysConfig` or keep them accessible elsewhere.

5. **Update `AttendanceManagement.tsx`:**
   - Add "Reports" sub-tab under Overview (matching Staging-Quickapp's `reports` tab)
   - Wire up `AttendanceReportGenerator` component
   - Add `downloadCSV` utility function

6. **Add `downloadCSV` utility** — `src/utils/fileDownloader.ts`

### Files to Create
- `src/hooks/useGlobalLeavePolicy.ts`
- `src/hooks/useRegularizationPolicy.ts`
- `src/components/attendance/LeavePolicyConfig.tsx`
- `src/components/attendance/RegularizationPolicyConfig.tsx`
- `src/components/attendance/AttendanceReportGenerator.tsx`
- `src/utils/fileDownloader.ts`

### Files to Modify
- `src/components/attendance/AttendancePolicyConfig.tsx` — refactor to compose the two policy configs
- `src/pages/AttendanceManagement.tsx` — add Reports tab, wire new components

### No Changes To
- Leave application approval/rejection logic (already matches)
- Regularization approval logic with attendance upsert (already matches)
- Notification system on approval/rejection (already implemented, Staging-Quickapp doesn't have this — we keep it)
- Hierarchy-based access control (already implemented)

