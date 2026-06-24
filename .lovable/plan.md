## Goal

Redesign `src/components/procurement/GRNForm.tsx` to look modern and professional, fix the whitespace/centering, and restructure each section as requested. This is a presentation-only change — save logic, status driving, and photo upload utilities stay the same.

## Changes (all in `GRNForm.tsx`)

### 1. Layout & whitespace
- Keep the fullscreen dialog shell, but wrap the scrollable content in a centered container: `max-w-[800px] w-full mx-auto px-4` so content is centered with proper gutters on all screen sizes (replaces the current `max-w-3xl`).
- Add bottom padding so content isn't hidden behind the new fixed footer.

### 2. Header
- Replace the plain title with a header row: a back-arrow button on the left (closes the form, same as Cancel), the text "Goods Receipt", and the PO number rendered as a clickable highlighted badge (e.g. `PO-009`). Tapping the badge closes the form and returns to the PO detail (calls `onOpenChange(false)`).

### 3. Top section (Date / Received By)
- Put "Date of Receipt" and "Received By" side by side inside a single light-background card (`bg-muted/40 rounded-lg border p-4`).

### 4. Items — Ordered vs Received
- Render as a proper table/card with columns: **Material | UOM | Ordered | Previously Received | Balance | Receiving Now**, one row per item.
- "Receiving Now" stays an editable numeric input, visually highlighted (accent/primary tinted background + ring) to draw attention.
- On narrow screens the table scrolls horizontally (overflow-x) so columns stay readable.
- Uses existing `alreadyReceived[it.id]` for Previously Received and `balance(it)` for Balance.

### 5. GRN Status as chips
- Replace the dropdown with two selectable pill/chip buttons: **Partially Received** and **Fully Received**. Active chip is highlighted (filled primary), inactive is outline. Selecting sets the same `status` state used by save logic. (The other statuses — Pending/Rejected — are no longer surfaced here; default stays "Fully Received".)

### 6. Progress bar
- Below the items table, show a progress bar reflecting cumulative received vs ordered (e.g. 112/120) with the numeric label, using existing `totals.cumulative` / `totals.ordered`.

### 7. Goods Photos
- Change `MAX_PHOTOS` from 5 to **20** (label text updates with it).
- Redesign the two buttons as proper colored icon buttons:
  - **Take Photo** — camera icon, blue styling, triggers existing `cameraInputRef` (`capture="environment"`).
  - **Upload from Gallery** — gallery icon, green styling, triggers existing `galleryInputRef` (`multiple`).
- Keep thumbnail grid with remove (X) behavior unchanged.

### 8. Bottom buttons
- Move Cancel (outline) and Save GRN (filled dark) into a footer bar that is `sticky`/fixed at the bottom of the screen on mobile (full width, side by side), with a top border and background so it stays visible while scrolling.

## Notes
- Color styling will use existing semantic tokens / Tailwind utilities consistent with the project (no hardcoded hex where avoidable); blue/green accents for the two photo buttons applied as button styling.
- No database, RLS, or save-logic changes. `GRN_STATUSES` in `procurement.ts` is left intact (still used by the GRN list page).
