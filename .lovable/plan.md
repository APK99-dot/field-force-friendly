# Redesign: Dashboard Activity Calendar → "Executive PM Grid"

Scope: `src/components/dashboard/WorkforceActivityCalendar.tsx` only. Keep upstream data flow (`activities`, `anchorDate` from `WorkforceOverviewSection`) unchanged.

## What changes visually

- **Card frame**: white surface, `rounded-2xl`, subtle soft shadow, hairline navy border. Sora for the title, Manrope for everything else (loaded via `<link>` in the component, matched to prototype).
- **Header row**:
  - Left: title "Activity Calendar" (Sora, bold, navy `#0B1E3F`) + subtitle "<Month YYYY> • N active tasks" (count = activities in month).
  - Right: segmented month stepper `[◀ | Month YYYY | ▶]` + solid navy "Today" pill.
- **Weekday header**: soft `#F5F7FB` band, 11px uppercase slate labels.
- **Day cells**: `min-h-[140px]`, hairline `#E9EEF7` gridlines. Out-of-month cells muted (`bg-[#F5F7FB]/30`, `text-slate-300`). In-month cells show date number top-left.
- **Today cell spotlight**: `bg-[#0B1E3F]/5` with a `border-2 border-[#D4A34A]/30` overlay ring and a small gold "TODAY" caps label top-right; date number switches to bold navy.
- **Event pills** (per activity): compact card with a 4px left color bar + tinted bg + name (bold) + site (muted). Status → colors:
  - `planned` → `bg-[#E9EEF7]` / bar `#1E3A6B` / text `#1E3A6B`
  - `in_progress` → `bg-[#FEF3C7]` / bar `#D4A34A` / text `#92400E`
  - `completed` → `bg-[#DCFCE7]` / bar `#22C55E` / text `#166534`
  - Hover: `brightness-95`. Keeps existing `navigate('/activities?id=…')` behavior and `title` tooltip.
  - Overflow: after 3 pills, show a `+N more` chip (still same-day, no popover — click bubbles to the first extra activity's page for now; matches current "just navigate" pattern).
- **Footer legend bar**: `#F5F7FB/50` background, three dot+label chips (Planned navy, In Progress gold, Completed green). Legend removed from the header (moved to footer per prototype).
- **Mobile**: cells shrink to `min-h-[96px]`, pill font sizes step down, header stacks (title above controls). Horizontal scroll kept via `overflow-x-auto` + `min-w-[720px]` inner grid so the 7-col layout never collapses.

## Behavior

- Add **prev / next month** state internal to `WorkforceActivityCalendar` (default = `anchorDate` prop, resets when `anchorDate` prop changes). "Today" resets to `new Date()`. Active-tasks count = `activities.length` filtered to the visible month.
- All existing props and click-through preserved. No new data fetches.

## Technical notes

- No new dependencies. Uses `date-fns` already in the file.
- Sora + Manrope loaded once via a `<link rel="stylesheet">` injected at module scope (guarded so it only appends once). Applied via inline `style={{ fontFamily }}` on the card root so tokens stay untouched — no global font override.
- Colors used inline (hex) match the prototype exactly, since the surrounding component set already uses semantic tokens like `bg-info` in other places; the calendar becomes a self-contained styled surface consistent with the picked direction. `text-primary` retained where already tokenized.
- Keep `WorkforceOverviewSection.tsx` untouched; it still passes `anchorDate` and `activities`.

## Out of scope

- No week/day toggle, no drag-drop, no new schema.
- No changes to `WorkforceOverviewSection`, filters, KPI cards, or attendance table.
