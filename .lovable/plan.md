

## Add Dynamic Activity Types with "Add New" Option

### Problem
Activity types are currently hardcoded as a static array in `Activities.tsx`. Users cannot add custom activity types, and there's no persistence or sharing across the system.

### Solution
Create an `activity_types_master` table in the database to store activity types globally, and add an inline "Add New Type" option within the Activity Type dropdown.

### Changes

#### 1. Database Migration
- Create `activity_types_master` table with columns: `id`, `name`, `is_active`, `created_by`, `created_at`
- Seed it with the existing hardcoded types (Site Visit, Contractor Meeting, etc.)
- RLS: Anyone authenticated can SELECT; admins can manage all; authenticated users can INSERT (so any user can add new types)

#### 2. `src/pages/Activities.tsx`
- Remove the hardcoded `activityTypes` array
- Add state to fetch activity types from `activity_types_master` on mount
- Replace the Activity Type `<Select>` with a combo that includes:
  - All existing types from the database
  - A separator + "Add New Type" option at the bottom
- When "Add New Type" is selected, show a small inline dialog/input to enter the new type name
- On submission, insert into `activity_types_master` and refresh the list
- The new type is immediately selected in the form

#### 3. No edge function needed
- Direct Supabase client insert with authenticated user's ID as `created_by`

### Technical Details
- Table schema: `id uuid PK default gen_random_uuid()`, `name text NOT NULL UNIQUE`, `is_active boolean default true`, `created_by uuid`, `created_at timestamptz default now()`
- RLS policies: SELECT for all authenticated, INSERT for all authenticated, UPDATE/DELETE for admins only
- The dropdown will show a `Plus` icon + "Add new type..." as the last item, which opens a small `Dialog` with a single text input and Save button
- After adding, the `activity_types_master` list is refetched and the new value is auto-selected

