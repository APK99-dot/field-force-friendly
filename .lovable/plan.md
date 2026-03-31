

## Plan: Minimize Site Table, Add Detail Panel, Add Flag Column

### 1. Database Migration
Add a `flag` column to `project_sites`:
```sql
ALTER TABLE project_sites ADD COLUMN flag text DEFAULT 'green' CHECK (flag IN ('red', 'orange', 'green'));
```

### 2. Rewrite `SiteMasterManagement.tsx`

**Table changes** -- reduce to 4 columns:
- Site Name (clickable, opens detail panel)
- Assigned Users
- Status (Active/Inactive badge)
- Flag (colored circle indicator -- red/orange/green)

Remove Code, Start Date, End Date, and Actions columns from the table.

**Detail panel** -- add a Sheet (side panel) that opens when clicking a site name:
- Displays: Site Name, Code, Description, Assigned Users list, Start Date, End Date, Status badge, Flag color
- Contains Edit button (opens existing edit dialog) and Active/Inactive toggle button
- Flag can be changed directly from the detail panel via a simple color picker (3 circles)

**Flag in table** -- render as a small colored dot with tooltip text ("Critical", "Needs Attention", "On Track").

**Flag in create/edit dialog** -- add a flag selector (3 colored circles) so flag can be set during creation/editing.

### 3. Update Site Interface
Add `flag: 'red' | 'orange' | 'green'` to the local `Site` interface.

### Files Modified
- `supabase/migrations/` -- new migration for `flag` column
- `src/components/admin/SiteMasterManagement.tsx` -- table columns, detail sheet, flag UI

