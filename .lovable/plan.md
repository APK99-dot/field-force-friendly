# Activities Field Execution Tracking

Enhance the Activities module so field staff can start, complete, geo-stamp, and photo-document each activity, with a full audit timeline.

## What changes for the user

- The **Status dropdown is removed** from the activity create/edit form. New activities always start as **Planned**.
- Each activity card gets two action buttons:
  - **Start / Check-In** (Planned → Work In Progress) — captures GPS + timestamp.
  - **Complete ✓** (In Progress → Completed) — captures GPS + timestamp.
- A new **Activity Details** view (opened by tapping a card) shows: current status, full status history timeline (each change with time + location), geo-stamp info, start/end times, and all uploaded photos.
- **Photos**: capture from camera or upload from gallery/files, multiple per activity, each tagged with the GPS location and time it was added.
- Works across Web, Mobile browser, APK (Capacitor), and PWA, reusing existing permission-aware helpers.

## Data model (migration)

Add to `activity_events`:
- `status_history jsonb not null default '[]'` — array of `{ status, at, lat, lng, address }` entries.
- `photo_urls jsonb not null default '[]'` — array of `{ url, at, lat, lng, address }` entries.

Re-affirm existing GRANTs (table already has policies; no new table). Keep existing `status`, `status_changed_at`, `status_change_lat/lng`, `location_lat/lng/address`, `start_time`, `end_time` columns — they continue to hold the latest values for backward compatibility and map markers.

New storage bucket **`activity-photos`** (public, like `activity-audio`) with `storage.objects` RLS policies allowing authenticated users to upload/read their own folder (`{user_id}/...`) and read for viewing.

## Implementation

### Form (`src/pages/Activities.tsx`)
- Remove the Status `<Select>` block inside the "Others" collapsible (lines ~1114-1122) and drop `status` from `defaultForm`, `handleOpenEdit`, and the save payload (new records default to `planned` server-side default / explicit `planned`).
- Add a **Photos** section in the form: a "Take Photo" button (opens existing `CameraCapture`) and an "Upload" file input (`accept="image/*" multiple`). Selected/captured images are compressed via `compressImage`, uploaded to `activity-photos`, GPS-tagged via `getCurrentPosition` + Nominatim reverse geocode, and appended to a local `photos` state, then saved into `photo_urls` on save.

### Status workflow (ActivityCard)
- Replace the status dropdown menu with explicit buttons:
  - When `status === 'planned'`: show **Start / Check-In**.
  - When `status === 'in_progress'`: show **Complete ✓**.
  - When `completed`: show a static badge.
- Reuse existing `handleStatusChange` logic (GPS capture + reverse geocode + start/end time) and additionally **append an entry to `status_history`** on each transition. Keep `status_change_*` and `location_*` updated as today.
- Keep the green status badge for display.

### Details view
- Add an **Activity Details** dialog (safe-area-aware, consistent with existing dialogs) opened on card tap. Sections:
  - Current status badge + activity name/type.
  - **Status history timeline**: each `status_history` entry with label, formatted time, and `lat,lng` / address.
  - **Geo stamp**: latest location address + coordinates.
  - **Times**: start_time / end_time.
  - **Photos**: responsive grid of all `photo_urls` with capture time + location caption; tap to view full size.
- Photo capture/upload also available here for in-progress activities.

### Hook (`src/hooks/useActivities.ts`)
- Add `status_history` and `photo_urls` to the `Activity` interface, the `updateActivity` field whitelist, the `createActivity` insert, and default them to `[]` in the mapper.

### Cross-platform handling
- Photo capture uses existing `CameraCapture` (web/PWA) and the file input fallback; on native, `takeNativePhoto` from `nativePermissions` is attempted first. GPS uses existing `getCurrentPosition` (native plugin → web fallback). No new permission code needed.

## Verification
- Build passes; create an activity (defaults to Planned), Start it (status → Work In Progress with geo + timestamp), add camera + gallery photos, Complete it, then open Details to confirm timeline, geo stamp, times, and all photos render. Spot-check on mobile viewport.
