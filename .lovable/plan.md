

## Plan: Project / Site Master System

### Current State
- Activities reference `pm_projects` table via `project_id` (UUID foreign key)
- The Project/Site dropdown in the activity form pulls from `pm_projects` (which are PM module projects, not construction sites)
- No dedicated site master table exists

### What Changes

**1. Create `project_sites` table (Database Migration)**

```sql
CREATE TABLE public.project_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_name TEXT NOT NULL,
  site_code TEXT GENERATED ALWAYS AS ('SITE-' || substr(id::text, 1, 6)) STORED,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_site_name UNIQUE (site_name)
);
```

RLS policies: Admins can manage all; authenticated users can view active + inactive (for historical joins); managers and users can insert.

**2. Update `activity_events` table**

Add a `site_id` column (UUID, nullable, references `project_sites`). Keep `project_id` for backward compatibility but the UI will switch to using `site_id` with the new `project_sites` table.

**3. Update Activity Form (Activities.tsx)**

Replace the current "Project / Site" dropdown (which reads from `pm_projects`) with one that reads from `project_sites` where `is_active = true`. Add an "➕ Add New Site" option at the bottom (same pattern as Activity Types). Save `site_id` instead of `project_id`.

**4. Update useActivities hook**

- Fetch site names by joining `project_sites` for display (including inactive sites for historical records)
- Save `site_id` on create/update
- Add `site_name` to the Activity interface

**5. Create Site Master Admin UI**

Add a "Project / Site Master" section accessible from Admin Controls. Table showing all sites with columns: Site Name, Code, Status (Active/Inactive badge), Created Date, Actions (Edit, Deactivate/Reactivate). Deactivation sets `is_active = false` and `deleted_at = now()`. Reactivation reverses it.

**6. Historical data protection**

- Activity cards will join `project_sites` including inactive records
- Inactive sites show an "(Inactive)" badge next to the name
- Inactive sites are excluded from the creation dropdown but remain visible in existing logs

### Files to Create
- Admin site management component (e.g., `src/components/admin/SiteMasterManagement.tsx`)

### Files to Modify
- `src/pages/Activities.tsx` — replace project dropdown with site dropdown + "Add New Site"
- `src/hooks/useActivities.ts` — add site_id handling, fetch site names
- `src/pages/AdminControls.tsx` — add link to Site Master management

### Database Changes
- Create `project_sites` table with RLS
- Add `site_id` column to `activity_events`

