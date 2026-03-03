

## Fix Edit User Button and Match Reference Edit Dialog

### Problem
1. The "Edit" button in the table does nothing (`onClick={() => {}}`)
2. The real `EditUserDialog` is buried inside the "..." dropdown menu
3. The edit dialog doesn't match the reference screenshot -- it should have tabbed sections (Basic Info, Managers, Reset Password) and footer action buttons (Delete Data, Delete User, Cancel, Save Changes)

### Changes

**File: `src/pages/AdminUserManagement.tsx`**

#### 1. Redesign `EditUserDialog` to match reference screenshot
- Add internal `Tabs` with three tabs: **Basic Info**, **Managers**, **Reset Password**
- **Basic Info tab**: Full Name, Username, Phone Number, Email (disabled), Role (Security Profile) dropdown
- **Managers tab**: Primary Manager and Secondary Manager selectors
- **Reset Password tab**: New password field with generate button
- **Dialog title**: "Edit User: {name}" matching the screenshot
- **Footer buttons**: Delete Data (outline/orange), Delete User (destructive/red), Cancel (outline), Save Changes (primary/dark)

#### 2. Convert `EditUserDialog` to use controlled open state from parent
- Remove the `DialogTrigger` wrapper from inside the component
- Accept `open` and `onOpenChange` props instead
- Add `editingUser` state to the main component to track which user is being edited

#### 3. Wire the Edit button in the table
- Replace the dead `onClick={() => {}}` on the Edit button with `onClick={() => setEditingUser(user)}`
- Remove `EditUserDialog` from inside the DropdownMenu
- Keep only "Delete" in the dropdown menu
- Render a single `EditUserDialog` instance at the page level, controlled by `editingUser` state

#### 4. Add Delete Data functionality
- "Delete Data" button clears operational records (attendance, visits, GPS, expenses, orders) but keeps the user account
- "Delete User" button triggers the existing full delete confirmation dialog

### Technical Details

- The dialog uses the existing `Tabs` component for internal tab switching
- Reset Password will call `supabase.auth.admin.updateUser()` via an edge function or show a placeholder
- The `EditUserDialog` state fields reset via `useEffect` when user changes
- Footer layout: `flex justify-between` with destructive buttons on the left, cancel/save on the right -- matching the screenshot exactly
