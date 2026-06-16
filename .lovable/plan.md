## Projects / Sites → Project Hub Dashboard

Transform the Projects/Sites module from a plain table into a modern, visually engaging project dashboard. Each site becomes a single hub showing details, team, milestones, gallery, documents, and full activity history — fully responsive across desktop, mobile PWA, and APK.

### 1. Database changes (one migration)

- Add `activity_code` (text, unique) to `activity_events`, auto-generated as a friendly sequential ID `ACT-0001`, `ACT-0002`, … via a Postgres sequence + `BEFORE INSERT` trigger.
- Backfill existing activities with sequential codes ordered by `created_at`.
- This requires no client change to creation logic — codes generate server-side automatically. The `activity_code` is naturally linked to its `site_id`, so all activity IDs for a site are queryable directly.

```text
activity_events
 ├─ activity_code  ACT-0001  (new, unique, auto)
 └─ site_id        → project_sites.id   (existing link)
```

### 2. Redesigned Sites landing (`SiteMasterManagement.tsx`)

Replace the bare table with a modern **card grid** dashboard:
- Each site rendered as a visual card: name, status badge (color-coded: Planned/Started/Completed/Dropped), assigned-user avatars (stacked), milestone progress bar (avg % complete), counts for activities/photos/docs, and date range.
- Subtle gradients, shadows, hover lift (framer-motion), responsive grid (1 col mobile → 2–3 cols desktop).
- "Add Site" and search/filter controls in a clean header.

### 3. Site Project Hub (large side sheet/drawer)

Clicking a site opens a wide `Sheet` (full-width on mobile, ~640–720px on desktop) with tabbed sections so it stays clean on every screen:

- **Overview** — description, status, date range, flag, progress summary, assigned-user list with avatars.
- **Milestones** — list with progress bar, % completion, planned vs actual dates, status badges (read-only view; editing stays in Edit Site).
- **Gallery** — combined grid of (a) all `photo_urls` from activities linked to the site and (b) site-level image attachments. Each photo shows: uploaded/captured by (activity owner's name), date & time, and the related Activity ID (`ACT-xxxx`) as a clickable chip. Tap a photo to enlarge.
- **Activities** — list/timeline of all activities for the site, each row showing Activity ID, name, user, date/time, and status. Clicking an Activity ID opens the full Activity record (reusing `ActivityDetailsDialog`) with details, user, date/time, description, status, GPS/location, check-in/out, photos & attachments, and linked milestone.
- **Documents** — non-image attachments list with download.

The existing Edit Site dialog (milestones editor, attachments, user multiselect, status dropdown) is preserved and reachable from the hub header.

### 4. Activity record consumption

- `ActivityDetailsDialog` is reused for the click-through from the gallery and activity list. It will be passed a fully-mapped activity object (joined user name, site, milestone, photos, status history). Add GPS/location and check-in/out display if not already shown.
- Fetch the site's activities + attendance (check-in/out) in the hub via a dedicated query keyed on `site_id`.

### 5. Responsiveness & polish

- Card grid and tabs collapse gracefully: tabs become horizontally scrollable on narrow screens; gallery is a fluid `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`; milestone/activity rows stack.
- Respects safe-area insets (already handled by Sheet). Uses semantic Navy & Gold design tokens — no hardcoded colors.

### Technical notes

- New data hook (e.g. `useSiteHub(siteId)`) loads milestones, activities (with codes), photos, attachments, assigned users, and attendance in parallel; refetch on `visibilitychange` per project convention.
- Activity photos lack an explicit uploader field, so "uploaded by" uses the activity's owner (`user_id` → full name); capture time uses each photo entry's `at` timestamp.
- Gallery photo → Activity mapping done by tagging each `photo_urls` entry with its parent activity's id/code during the fetch.
- No inline sub-components in render (per project rule); extract Gallery, MilestoneList, ActivityList, SiteCard into their own files.
</content>
<summary>Turn Projects/Sites into a modern card-grid dashboard with a tabbed project-hub drawer (overview, milestones, gallery, activities, documents), add auto sequential Activity IDs (ACT-0001) linked to sites, and clickable activity records — fully responsive.</summary>
</invoke>
