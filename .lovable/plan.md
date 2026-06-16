# Milestone Management Refactor

Milestones become a managed child entity of each Site, edited only from Projects / Sites. The Activities module consumes them read-only via a dropdown — no more inline milestone creation.

## 1. Database (migration)

Extend `public.site_milestones` (existing `start_date`/`end_date` become the Planned dates):

- Add `actual_start_date date` (nullable)
- Add `actual_end_date date` (nullable)
- Add `percent_complete integer not null default 0` (0–100, validated via trigger)
- Add `notes text` (nullable)
- Add `is_active boolean not null default true` (so Activities can load only active milestones)
- Keep `status text` but broaden allowed values to: `not_started`, `in_progress`, `completed`, `delayed`, `on_hold`
- Re-affirm existing GRANTs; add a validation trigger for `percent_complete` between 0 and 100 and `actual_end_date >= actual_start_date`.

`start_date`/`end_date` stay NOT NULL and are surfaced in the UI as **Planned Start / Planned End**.

## 2. Projects / Sites — Milestone Management popup

In `src/components/admin/SiteMasterManagement.tsx`:

- Add a **Milestones** button on each site row (and in the site detail Sheet) that opens a new dialog component.
- New component `src/components/admin/SiteMilestonesDialog.tsx`:
  - Lists existing milestones for the site with name, status badge, % complete, planned vs actual dates.
  - Create / Edit / Delete milestones. Each milestone form has: Milestone Name, Planned Start, Planned End, Actual Start, Actual End, Percentage Completion (slider/number 0–100), Status (Not Started / In Progress / Completed / Delayed / On Hold), Notes.
  - Saves directly to `site_milestones` (live CRUD, not deferred).
- The site Edit dialog also exposes the same Milestones management entry point (button opening the dialog), satisfying "manage milestones from Edit Site".
- Remove the deferred milestone save logic currently bundled into `handleSave` (milestones now managed independently in their own dialog).

## 3. Activities — consume milestones (read-only)

In `src/pages/Activities.tsx`:

- **Remove** the inline "Add Milestones" repeatable section and the milestone-insert code in the save handler (lines ~641–655).
- Keep/replace the "Existing Milestones" block with a **Milestone dropdown**:
  - When a site is selected, load only `is_active = true` milestones for that site.
  - Dropdown bound to `form.milestone_id`.
  - On selection, show a read-only details panel: status, % complete, planned/actual dates, notes. No editing from Activities.
- `newMilestones` state and its UI are deleted.
- Activity save continues to store `milestone_id` only (no milestone writes).

## 4. Activity display

- Activity card milestone badge keeps showing milestone name + status; extend status label mapping to include `delayed` and `on_hold`.

## Technical notes

- Milestones remain the single source of truth in `site_milestones`, keyed by `site_id`; Activities reference them by `milestone_id` and never create/update milestone rows.
- The status label helper in Activities and the milestone dialog will share the 5-status set.
- `useActivities` already joins `milestone_name`/`milestone_status`; will extend the join select to also pull `percent_complete` and dates for the read-only details panel.

## Verification

- Create a site → open Milestones → add a milestone with all fields → confirm it persists and shows correct status/% .
- In Activities, select that site → milestone dropdown lists only active milestones → selecting shows read-only details → save activity stores milestone_id.
- Confirm Activity form no longer offers inline milestone creation.
- Build passes.
