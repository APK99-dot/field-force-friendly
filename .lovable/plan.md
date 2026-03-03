

## Expense Module Complete Restructure

This is a major restructure that removes all TA/DA/Beat Allowance logic and builds a clean Additional Expense Claim and Approval system.

### What Gets Removed
- TA/DA configuration from Admin Expense Master
- `ProductivityTracking` component usage in expense module
- `BeatAllowanceManagement` component (unused/dead code)
- `useExpenses` hook (references TA/DA, unused)
- Beat allowance calculations and references
- Old `AdditionalExpenses` component (replaced with new inline form)

### What Gets Created/Changed

---

### Database Changes (3 new tables, via migrations)

**1. `expense_categories` table**
- `id`, `name`, `monthly_limit` (nullable), `daily_limit` (nullable), `receipt_required_above` (nullable), `auto_approval_limit` (nullable), `is_active`, `created_at`, `updated_at`
- RLS: Admins manage all, authenticated users can view
- Seed with default categories: Travel, Food, Lodging, Internet, Fuel, Telephone Expense, Stay, Other

**2. `expense_policy` table** (single-row config)
- `id`, `submission_deadline` (integer, day of month), `allow_backdate` (boolean), `max_back_days` (integer), `multi_level_approval` (boolean), `month_lock_enabled` (boolean), `created_at`, `updated_at`
- RLS: Admins manage, authenticated users can view

**3. Modify `additional_expenses` table**
- Add columns: `category_id` (uuid, nullable FK to expense_categories), `rejection_reason` (text), `month_key` (text, format YYYY-MM)
- Keep existing `category` text column for backward compatibility

---

### Admin Side: `/admin/expenses` (rewrite `AdminExpenseManagement.tsx`)

**3 Tabs:**

**Tab 1 - Configuration**
- Expense Categories CRUD: name, monthly limit, daily limit, receipt required above amount, auto-approval limit, active toggle
- Policy Settings: submission deadline day, allow backdated entries toggle, max back days, multi-level approval toggle, month lock toggle

**Tab 2 - Pending Approvals**
- Table: User, Category, Date, Amount, Receipt, Description, Action (Approve/Reject)
- Reject requires mandatory remark (uses existing `RejectionReasonDialog`)
- Filters: Month selector, User dropdown, Category dropdown, Status dropdown
- Fetches from `additional_expenses` joined with `users` for names

**Tab 3 - Monthly Overview**
- Summary cards: Total Claimed, Total Approved, Total Pending, Total Rejected
- Table: User | Total Applied | Approved | Pending | Rejected
- Click row to expand detailed breakdown
- Export to XLS button

---

### User Side: `/expenses` (rewrite `Expenses.tsx`)

**Section 1 - Summary Cards (top)**
- Month selector dropdown (generates last 12 months)
- 4 cards: Total Submitted, Total Approved, Total Pending, Total Rejected

**Section 2 - Expense List**
- Card-based list showing: Date, Category, Description, Amount, Status badge
- Status: draft, submitted, approved, rejected
- Actions: Edit (if draft/rejected), Delete (if draft only), View rejection reason
- Filter by status

**Section 3 - Add Expense (FAB button opens modal)**
- Fields: Date, Category (dropdown from `expense_categories`), Amount, Description, Receipt upload
- Policy validation: check backdating rules, submission deadline
- Submit sets status to "submitted" and notifies reporting manager

---

### Files to Create
1. None needed beyond the rewrites

### Files to Modify
1. **`src/pages/AdminExpenseManagement.tsx`** - Complete rewrite with 3 tabs (Configuration, Approvals, Overview)
2. **`src/pages/Expenses.tsx`** - Complete rewrite with month filter, summary cards, expense list, add modal
3. **`src/components/AdditionalExpenses.tsx`** - Rewrite to use `expense_categories` table for category dropdown instead of hardcoded list

### Files to Delete (dead code)
1. **`src/components/BeatAllowanceManagement.tsx`** - Unused, all TA/DA logic
2. **`src/hooks/useExpenses.ts`** - Contains TA/DA calculations, unused
3. **`src/components/ProductivityTracking.tsx`** - Remove from expense module (note: also used in admin page, will be removed from there)

### Route Changes
- Keep `/admin/expenses` route as-is (same component, rewritten)
- Keep `/expenses` route as-is (same component, rewritten)

### Migration Summary
```text
1. CREATE TABLE expense_categories (with seed data)
2. CREATE TABLE expense_policy (with default row)
3. ALTER TABLE additional_expenses ADD COLUMN rejection_reason, month_key, category_id
```

### Approval Flow
- User submits expense -> status = "submitted"
- If amount < category's `auto_approval_limit` -> auto-set to "approved"
- Otherwise, manager/admin sees in Pending Approvals tab
- Approve -> status = "approved"
- Reject -> status = "rejected" + mandatory rejection_reason
- Notification sent to reporting manager on submit (existing flow preserved)

