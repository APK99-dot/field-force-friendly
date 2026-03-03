

## Plan: Restructure Expenses Page with "My Expenses" and "My Team" Tabs

### Current State
- `/expenses` (Expenses.tsx) — shows only the logged-in user's own expenses
- `/pending-approvals` (PendingApprovals.tsx) — has an "Expenses" tab for approving team expenses, but it's mixed with leave and regularization approvals
- Admin Expense Management has its own separate approvals tab

### What Changes

**1. Add Tabs to Expenses.tsx: "My Expenses" + "My Team"**

Wrap the existing Expenses page content in a `Tabs` component:
- **My Expenses** tab — the current expense list (no changes to logic)
- **My Team** tab — fetches expenses from subordinates (via `reporting_manager_id`), displayed as cards with employee name, category, amount, date, status, description, and approve/reject buttons for pending items

**2. Create `MyTeamExpenses` component**

New file `src/components/expenses/MyTeamExpenses.tsx`:
- Fetches subordinate user IDs from `users` table where `reporting_manager_id = currentUserId`
- Queries `additional_expenses` for those user IDs with month filter and status filter
- Renders card-style list showing: employee name, category, amount, date, description, status badge
- Pending expenses get Approve/Reject action buttons
- Approve updates status to `approved`, Reject opens rejection reason dialog
- Sends notification to the user on action
- Month and status filters at the top

**3. Remove Expenses tab from PendingApprovals.tsx**

Remove the expenses tab, type, and all expense-related code from `PendingApprovals.tsx` since it's now handled in the Expenses page. Keep only Leave and Regularization tabs.

### Files to Create
- `src/components/expenses/MyTeamExpenses.tsx`

### Files to Modify
- `src/pages/Expenses.tsx` — wrap in Tabs, add "My Team" tab
- `src/pages/PendingApprovals.tsx` — remove expenses tab and related logic

