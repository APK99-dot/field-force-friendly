

## Plan: Activity + Project/Site Integration with Milestones

### Overview
Create a milestone tracking system for project sites, link milestones to activities, and display milestone/site info on activity cards.

---

### Database Changes

**New table: `site_milestones`**
- `id` (uuid, PK)
- `site_id` (uuid, FK to project_sites.id, NOT NULL)
- `name` (text, NOT NULL)
- `start_date` (date, NOT NULL)
- `end_date` (date, NOT NULL)
- `status` (text, NOT NULL, default 'not_started') -- values: not_started, in_progress, completed
- `priority` (text, default 'medium') -- values: low, medium, high
- `created_at`, `updated_at` (timestamptz)

RLS: Admins full access, authenticated users can view.

**Alter `activity_events`**
- Add `milestone_id` (uuid, nullable) column

---

### Step 1: Database migration
Create the `site_milestones` table with RLS policies. Add `milestone_id` column to `activity_events`.

### Step 2: Add milestone section to Site Create/Edit dialog
In `SiteMasterManagement.tsx`:
- Add a repeatable "Milestones" section below the Flag picker in the Add/Edit Site dialog
- Each milestone row: Name, Start Date, End Date, Status dropdown, Priority dropdown, delete button
- "Add Milestone" button to add more rows
- On save, insert/update/delete milestones alongside the site save

### Step 3: Show milestones in Site detail panel
In the Sheet detail panel for a site:
- Display list of milestones with name, dates, status badge, priority
- Allow inline status changes

### Step 4: Add milestone dropdown to Activity form
In `Activities.tsx` Log New Activity dialog:
- When a site is selected, fetch its milestones
- Show a "Select Milestone" dropdown below the Project/Site field
- Clear milestone when site changes

### Step 5: Display milestone info on Activity cards
In the `ActivityCard` component:
- Show milestone name and status alongside site name
- Show site flag indicator
- Read-only display (milestone data comes from the site_milestones table)

### Step 6: Update Activity hook and types
- Add `milestone_id` to the `Activity` interface
- Add `milestone_name` and `milestone_status` as joined fields
- Fetch milestone data when loading activities

---

### Files to create/modify

| File | Action |
|------|--------|
| `supabase/migrations/...` | New migration for `site_milestones` table + `milestone_id` column |
| `src/components/admin/SiteMasterManagement.tsx` | Add milestone section to create/edit dialog and detail panel |
| `src/pages/Activities.tsx` | Add milestone dropdown in form, show milestone on cards |
| `src/hooks/useActivities.ts` | Add milestone_id to create/update, fetch milestone names |

---

### Technical details
- The existing `pm_milestones` table belongs to the PM module and uses `project_id`. The new `site_milestones` table is separate and uses `site_id` to keep the two modules independent.
- Milestone data on activity cards is read-only -- activities reference milestones but cannot modify them.
- Site flag is already stored on `project_sites.flag` and will be fetched alongside site data for display on activity cards.

