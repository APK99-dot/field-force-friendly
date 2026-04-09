

## Plan: Vendor Management Module

### Overview
Create a standalone Vendor Management module accessible from the sidebar/drawer navigation (not under Admin Controls). It will support full CRUD for vendors with duplicate phone prevention, and the schema will include foreign key columns for future linking with Sites, Activities, and Expenses.

---

### Database Changes

**New table: `vendors`**
- `id` (uuid, PK, default gen_random_uuid())
- `name` (text, NOT NULL)
- `phone` (text, NOT NULL, UNIQUE) -- prevents duplicates
- `company` (text, nullable)
- `contact_person` (text, nullable)
- `email` (text, nullable)
- `address` (text, nullable)
- `category` (text, nullable) -- e.g. "Electrical", "Plumbing", "Civil"
- `services` (text, nullable)
- `notes` (text, nullable)
- `status` (text, NOT NULL, default 'active') -- active, inactive, blacklisted
- `created_by` (uuid, NOT NULL)
- `created_at`, `updated_at` (timestamptz)

RLS: Admins full CRUD, authenticated users can view all vendors.

---

### Step 1: Database migration
Create `vendors` table with UNIQUE constraint on `phone`, RLS policies, and updated_at trigger.

### Step 2: Create Vendors page (`src/pages/Vendors.tsx`)
- Vendor list with search bar (name/phone/company)
- Filter dropdowns for Category and Status
- "Add Vendor" button opening a dialog/sheet
- Each row shows: Name, Phone, Company, Category, Status badge
- Actions: View details, Edit, Delete (with confirmation)
- Mobile-friendly card layout on small screens, table on desktop

### Step 3: Add Vendor dialog
- Form with Name (required), Phone (required), and optional fields
- Category as a searchable dropdown with preset options + custom entry
- Status dropdown (Active, Inactive, Blacklisted)
- Client-side phone format validation
- On submit, handle unique constraint error to show "Vendor with this phone already exists"

### Step 4: Vendor detail view
- Sheet/dialog showing all vendor details
- Call button (`tel:` link) and Email button (`mailto:` link) -- works on both APK and PWA
- Edit and Delete actions from detail view

### Step 5: Add to navigation
- Add "Vendors" to `allNavigationItems` in `AppHeader.tsx` (sidebar drawer) with a `Store` or `Handshake` icon
- Add route `/vendors` in `App.tsx`
- Add to `More.tsx` navigation items
- No bottom nav change (keep it minimal)

---

### Files to create/modify

| File | Action |
|------|--------|
| `supabase/migrations/...` | New migration for `vendors` table |
| `src/pages/Vendors.tsx` | New -- full vendor management page |
| `src/App.tsx` | Add `/vendors` route |
| `src/components/layout/AppHeader.tsx` | Add Vendors to drawer nav items |
| `src/pages/More.tsx` | Add Vendors to navigation grid |

### Future-ready design
The `vendors` table schema is designed so that later we can:
- Add `vendor_id` FK to `project_sites`, `activity_events`, `additional_expenses`
- Create a `vendor_site_assignments` junction table
- All without changing the vendors table itself

