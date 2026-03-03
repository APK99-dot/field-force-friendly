

## Fix Expense Master UI Overlap and Unlimited Expense Logic

### Problem 1: Tab Text Overlapping on Mobile
The `TabsList` uses `grid grid-cols-3` which forces all 3 tabs into equal-width columns. On mobile screens, "Pending Approvals" and "Monthly Overview" overflow and overlap each other.

### Problem 2: No Limit = Unlimited
Currently, when `monthly_limit`, `daily_limit`, or `auto_approval_limit` fields are left empty (null), the system should treat this as "unlimited" (no restriction). The submission logic and admin UI need to clearly communicate this.

---

### Changes

**File: `src/pages/AdminExpenseManagement.tsx`**

1. **Fix tab overflow**: Change `TabsList` from `grid grid-cols-3` to a scrollable horizontal layout using `w-full flex overflow-x-auto` styling, with smaller text on mobile (`text-xs sm:text-sm`). Shorten tab labels on mobile: "Config", "Approvals", "Overview".

2. **Category table mobile fix**: The categories table has 7 columns which also overflow on mobile. Wrap it to show as stacked cards on mobile instead of a table, or hide non-essential columns (`daily_limit`, `receipt_required_above`) on small screens.

3. **Show "Unlimited" hint**: In the category table, show placeholder text "Unlimited" in limit input fields when they are empty/null so admins understand leaving it blank means no restriction.

4. **Unlimited logic in user submission** (`src/pages/Expenses.tsx`): The auto-approval check already handles null correctly (`cat?.auto_approval_limit && amount < cat.auto_approval_limit` -- if null, this is falsy, so it skips auto-approve). No change needed there. But the submission should NOT block if no monthly/daily limit is set -- currently it doesn't check limits at all during submission, so this is already "unlimited" by default. No code change needed for the logic itself.

### Technical Details

**TabsList fix (AdminExpenseManagement.tsx line 72)**:
- Replace `grid w-full grid-cols-3` with `w-full` and add `className="text-xs sm:text-sm"` to each `TabsTrigger`
- This lets the tabs wrap or scroll naturally

**Category inputs (lines 177-191)**:
- Add `placeholder="Unlimited"` to all limit Input fields instead of the current dash placeholder

**No functional logic changes needed** -- null limits already mean "no restriction" in the current code since no limit checks are performed during expense submission beyond auto-approval.
