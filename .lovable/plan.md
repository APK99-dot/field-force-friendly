

# Monthly Leave Allocation with Carry-Forward Logic

## Summary
Enhance the leave system to allocate leaves monthly (based on DOJ), carry forward unused leaves each month, and display monthly breakdown in the user-facing Attendance → Leaves section.

## Database Changes

### 1. New table: `monthly_leave_accrual`
Tracks per-user, per-leave-type, per-month allocation and carry-forward:

```sql
CREATE TABLE public.monthly_leave_accrual (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  leave_type_id uuid NOT NULL,
  year integer NOT NULL,
  month integer NOT NULL, -- 1-12
  allocated numeric NOT NULL DEFAULT 0,
  carried_forward numeric NOT NULL DEFAULT 0,
  used numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, leave_type_id, year, month)
);
```
With RLS: admins full access, users can view own records.

### 2. Database function: `recalculate_monthly_leave_accruals`
A SQL/plpgsql function that, for a given user (or all users):
- Determines DOJ from `employees` table
- For each active leave type, calculates monthly allocation = `annual_quota / 12`
- Starting from DOJ month (or Jan if joined before that year), iterates month by month
- For each month: `carried_forward` = previous month's `(carried_forward + allocated - used)`
- `used` is computed from approved `leave_applications` whose dates fall in that month
- Upserts into `monthly_leave_accrual`
- Updates the `leave_balance` table's `opening_balance` and `remaining_balance` to reflect cumulative totals

This function will be callable from the admin UI ("Recalculate" button) and can be scheduled via a cron edge function for automatic monthly updates.

### 3. Edge function: `monthly-leave-cron`
A scheduled edge function that runs on the 1st of each month to call `recalculate_monthly_leave_accruals` for all active users, ensuring carry-forward happens automatically.

## Frontend Changes

### 1. `LeaveBalanceCards.tsx` — User-facing leave tab
- Fetch from `monthly_leave_accrual` for the current month alongside `leave_balance`
- Display additional fields: **Monthly Allocated**, **Carried Forward**, **Used**, **Remaining**
- Show a small summary line like "2 carried from Feb" under each leave type

### 2. `LeaveBalancesManager.tsx` — Admin leave balances
- Add a "Recalculate Monthly" button that calls the DB function
- Show carry-forward column in the table
- Optionally add a monthly breakdown expandable row

### 3. `LeaveApplicationModal.tsx`
- No structural changes needed; balance validation will naturally use the updated `leave_balance` remaining values

## Flow

```text
DOJ (e.g. Mar 15) → Monthly allocation starts March
  March: allocated=1, carried=0, used=0 → remaining=1
  April: allocated=1, carried=1, used=0 → remaining=2
  May:   allocated=1, carried=2, used=1 → remaining=2
  ...
leave_balance.opening_balance = sum(allocated) + sum(carried_forward adjustments)
leave_balance.remaining_balance = cumulative remaining
```

## Files to Create/Modify
- **Migration SQL**: Create `monthly_leave_accrual` table + `recalculate_monthly_leave_accruals` function
- **`supabase/functions/monthly-leave-cron/index.ts`**: Edge function for automatic monthly recalculation
- **`src/components/LeaveBalanceCards.tsx`**: Show monthly breakdown with carry-forward
- **`src/components/attendance/LeaveBalancesManager.tsx`**: Add recalculate monthly button, carry-forward column
- **`src/hooks/useMonthlyLeaveAccrual.ts`**: New hook to fetch monthly accrual data

