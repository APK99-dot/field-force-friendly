

## Timeline View, GPS Track View, and Manager Activity Assignment

### Overview
Enhance the Activities page with three key improvements:
1. **Timeline View** - Show activities as a chronological timeline with day-start/end markers and time-ordered activity cards
2. **GPS Track View** - Embed GPS tracking inline within the Activities page (instead of navigating to a separate page), showing the user's tracked route for the selected date
3. **Manager Activity Assignment** - Allow managers/admins to assign activities to subordinates by adding an "Activity Owner" field in the Log New Activity form

---

### 1. Timeline View (replace current flat list when "Timeline" tab is active)

**Current behavior:** The Timeline tab shows the same flat card list as the activity tab.

**New behavior:** When the Timeline tab is selected, render a vertical timeline UI:
- A "Day Started" marker at the top showing check-in time (from the `attendance` table for that user/date)
- Each activity rendered as a timeline node, sorted by `start_time` ascending
- Each node shows: time (left side), activity name, type, status badge, duration, and location
- A connecting vertical line between nodes
- A "Day Ended" marker at the bottom if the user has checked out
- If no attendance record exists, show "No day start recorded" placeholder

**Data source:** Fetch attendance check-in/check-out for the selected user + date from the `attendance` table alongside the existing activity_events.

---

### 2. GPS Track View (inline within Activities page)

**Current behavior:** The GPS Track tab button exists but doesn't show meaningful tracking data inline.

**New behavior:** When the "GPS Track" tab is selected:
- Fetch GPS tracking points from `gps_tracking` table for the selected user and date
- Show the LeafletMap component with polyline connecting all GPS points chronologically
- Show activity locations as markers on the map
- Display a summary: total distance (calculated from GPS points), number of stops, and tracking duration
- If no GPS data exists for the date, show an empty state

**Data source:** `gps_tracking` table filtered by `user_id` and `date`, plus `gps_tracking_stops` for stop markers.

---

### 3. Manager Activity Assignment (Activity Owner in Log New Activity)

**Current behavior:** Activities are always created with `user_id = auth.uid()` (the logged-in user). No way for a manager to assign activities to subordinates.

**New behavior:**
- In the "Log New Activity" dialog, add an "Activity Owner" dropdown at the top of the form
- For regular users: this field is hidden or shows only their own name (read-only)
- For managers/admins: the dropdown lists subordinate users (fetched via `get_user_hierarchy` RPC or the existing users list) plus themselves
- When creating an activity, use the selected owner's user_id instead of always `auth.uid()`
- Display the owner name on each activity card

**Database change needed:**
- The existing RLS policies only allow `INSERT` where `user_id = auth.uid()`. A new policy is needed to allow managers to insert activities for subordinates:
  ```sql
  CREATE POLICY "Managers can insert activities for subordinates"
  ON public.activity_events FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() OR
    user_id IN (SELECT sub.user_id FROM get_user_hierarchy(auth.uid()) sub)
  );
  ```
- Update the existing INSERT policy or add this as an additional permissive policy.

---

### Technical Details

**Files to modify:**

1. **`src/pages/Activities.tsx`**
   - Add timeline rendering logic when `activeTab === "timeline"`: vertical line, time markers, attendance day-start/end
   - Add inline GPS map rendering when `activeTab === "gps"`: fetch gps_tracking data, render LeafletMap with polyline
   - Add "Activity Owner" Select dropdown in the create/edit dialog (visible to admins/managers)
   - Pass selected owner user_id to `createActivity`

2. **`src/hooks/useActivities.ts`**
   - Modify `createActivity` to accept an optional `target_user_id` parameter instead of always using `auth.uid()`
   - Add a new `fetchAttendanceForDate(userId, date)` function to get check-in/check-out times
   - Add a new `fetchGPSTrackingForDate(userId, date)` function to get GPS points

3. **`src/components/LeafletMap.tsx`** (minor)
   - Ensure it can accept an array of GPS points for polyline rendering (may need to check current props)

4. **Database migration**
   - Add RLS policy for managers to insert activities for subordinates
   - The existing "Managers can view subordinate activities" SELECT policy already exists

**Rendering approach for Timeline:**
```text
  09:15 AM  [*]---- Day Started (Check-in)
             |
  09:30 AM  [*]---- Site Visit - Block A Inspection [Completed]
             |        Location: Sector 42
             |        Duration: 1.5h
             |
  11:00 AM  [*]---- Client Meeting - ABC Corp [In Progress]
             |        Duration: 2h
             |
  06:00 PM  [*]---- Day Ended (Check-out)
```

**GPS Track inline view:**
- Map showing polyline of GPS trail
- Activity location pins overlaid
- Summary stats bar: Distance traveled, Stops, Duration
