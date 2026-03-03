

## Simplify Expenses Page: Additional Expenses Only with Manager Approval

### Overview
Remove all TA/DA functionality from the Expenses page. Keep only the Additional Expenses feature where users can add expenses that get sent to their reporting manager for approval via the existing notification and approval workflow.

### Changes Required

#### 1. Rewrite Expenses Page (`src/pages/Expenses.tsx`)
- Replace the `BeatAllowanceManagement` component with a simplified page that only shows:
  - A date filter (this week, last week, this month, etc.)
  - A summary card showing total additional expenses and pending/approved/rejected counts
  - A list of the user's additional expenses with status badges (pending/approved/rejected)
  - A button to add new expenses (opens the existing `AdditionalExpenses` form in a dialog)

#### 2. Update `AdditionalExpenses` Component (`src/components/AdditionalExpenses.tsx`)
- After saving expenses, look up the user's `reporting_manager_id` from the `users` table
- Send a notification to the reporting manager using the existing `send_notification` RPC (same pattern as leave applications and regularization requests)
- Show the expense status (pending/approved/rejected) on each saved expense card

#### 3. Database Migration: Add Delete Policy for Additional Expenses
- The `additional_expenses` table already has a `status` column (default `'pending'`). This will be used for the approval workflow.
- Add a missing RLS policy: allow users to delete their own pending expenses
- Add RLS policy for managers to view subordinate expenses (for the approval flow)

#### 4. Add Expense Approval Tab to Pending Approvals Page (`src/pages/PendingApprovals.tsx`)
- Add a third tab: "Expenses" alongside Leave and Regularisation
- Fetch pending expenses from subordinates (same `reporting_manager_id` pattern already used)
- Allow managers to approve/reject with the same UI pattern (approve/reject buttons, rejection reason dialog)
- On approval/rejection, update the expense status and notify the employee

### Technical Details

**Notification on expense submission** (in `AdditionalExpenses.tsx`):
```typescript
// After saving expenses, notify reporting manager
const { data: userData } = await supabase
  .from('users')
  .select('reporting_manager_id, full_name')
  .eq('id', userId)
  .single();

if (userData?.reporting_manager_id) {
  await supabase.rpc('send_notification', {
    user_id_param: userData.reporting_manager_id,
    title_param: `Expense Claim - ${userData.full_name}`,
    message_param: `New expense of Rs.${totalAmount} submitted for approval`,
    type_param: 'expense_request',
    related_table_param: 'additional_expenses',
  });
}
```

**New RLS policies needed:**
- Manager SELECT policy on `additional_expenses`: managers can view expenses where user_id is in their subordinates
- User DELETE policy on `additional_expenses`: users can delete own expenses (only pending ones ideally)

**PendingApprovals changes:**
- Add expense tab fetching `additional_expenses` with status='pending' for subordinate user IDs
- Approve updates status to 'approved', reject updates to 'rejected'
- Notification sent back to the employee on decision

**Files to modify:**
1. `src/pages/Expenses.tsx` -- simplified page, no TA/DA
2. `src/components/AdditionalExpenses.tsx` -- add manager notification on save, show status
3. `src/pages/PendingApprovals.tsx` -- add Expenses tab for manager approval
4. Database migration -- add manager SELECT + user DELETE RLS policies on `additional_expenses`

