

## Plan: Status Change with Location & Timestamp Capture

### What Changes

When a user taps on an activity's status badge (e.g., "Planned"), a quick-action dropdown appears allowing them to change the status. On status change, the app automatically:
1. Captures the user's current GPS location via the browser Geolocation API
2. Records the current timestamp
3. Updates the activity record with the new status, location coordinates, location address (via reverse geocoding), and start/end time based on status transition
4. All data is stored in the existing `activity_events` table columns (`location_lat`, `location_lng`, `location_address`, `start_time`, `end_time`)
5. Admin can see all this data in the activity cards and admin panel

### Technical Details

**1. Add a `status_changed_at` and `status_change_location` columns** (migration)
- Add `status_changed_at` (timestamptz) and `status_change_lat`/`status_change_lng` (numeric) columns to `activity_events` to track specifically when and where status was changed (separate from the activity's own time/location)

**2. Update `ActivityCard` component** (`src/pages/Activities.tsx`)
- Make the status Badge clickable — wrap it in a Popover or DropdownMenu
- Show status options (Planned, In Progress, Completed)
- On selection, call browser `navigator.geolocation.getCurrentPosition()` to capture lat/lng
- Use a simple reverse geocode (or just store coordinates) to get an address
- Call `updateActivity` with the new status + location + timestamp

**3. Update `useActivities` hook** (`src/hooks/useActivities.ts`)
- Update `updateActivity` to also save `status_changed_at`, `status_change_lat`, `status_change_lng`, and `location_address`
- Add these fields to the `Activity` interface

**4. Display in activity cards**
- Show location and timestamp of last status change on the card (small text below status badge)
- Admin panel already shows all activities — the new fields will be visible

### Files Modified
- `src/pages/Activities.tsx` — Clickable status badge with dropdown, geolocation capture
- `src/hooks/useActivities.ts` — Updated interface and update function
- Database migration — Add `status_changed_at`, `status_change_lat`, `status_change_lng` columns

