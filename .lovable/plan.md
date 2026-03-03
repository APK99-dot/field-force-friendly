

## Fix Column Chooser and Table UX in User Management

### What's Wrong
The "Columns" button currently does nothing -- it's a static button with no popover or functionality. The screenshot from the reference project shows a proper **Popover** with checkboxes to toggle column visibility. Additionally, the table needs to support showing/hiding columns like Full Name, Phone, Email Status, Joined Date dynamically.

### Changes

**File: `src/pages/AdminUserManagement.tsx`**

1. **Add `allColumns` configuration array** (matching reference project pattern):
   - `photo` (default: on, locked)
   - `username` / User Name (default: on)
   - `email` (default: on)
   - `role` (default: on)
   - `manager` / Reporting Manager (default: on)
   - `active` (default: on)
   - `email_status` / Email Status (default: off)
   - `action` (default: on, locked)
   - `full_name` / Full Name (default: off)
   - `phone` / Phone (default: off)

2. **Add `visibleColumns` state** initialized from columns where `default: true`.

3. **Replace the static Columns button** with a `Popover` + `PopoverContent` containing:
   - "Choose columns" heading
   - `ScrollArea` with `Checkbox` for each column
   - `photo` and `action` checkboxes are disabled (always visible)
   - Matches the exact layout from the reference: `PopoverContent className="w-56" align="end"`

4. **Make table columns conditional**: Wrap each `TableHead` and `TableCell` in `{visibleColumns.includes('key') && (...)}` checks so toggling a checkbox instantly shows/hides the column.

5. **Add new column data rendering** for the newly available columns:
   - **Full Name**: `user.full_name` (separate from User Name which shows `full_name || username`)
   - **Phone**: `user.phone`
   - **Email Status**: Badge showing "Verified" or "Pending" (currently not tracked, will show based on profile data or default to "Active")

6. **Import additions**: Add `Popover, PopoverTrigger, PopoverContent` and `Checkbox` imports.

### Technical Details

- The `allColumns` array defines `{ key, label, default }` for each column
- `visibleColumns` state: `useState<string[]>(allColumns.filter(c => c.default).map(c => c.key))`
- The Popover uses `ScrollArea` with `h-[280px]` for consistent height
- Photo and Action columns have `disabled` on their Checkbox to prevent hiding
- No responsive `hidden sm:table-cell` classes needed anymore since column visibility is user-controlled
- Remove the existing hardcoded `hidden sm:table-cell` / `hidden md:table-cell` classes from Email and Reporting Manager columns

