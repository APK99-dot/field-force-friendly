

## Fix Action Button Colors to Match Reference Design

### Problem
The three action buttons (Timeline, GPS Track, Activity) in the Activities header don't perfectly match the reference screenshot. The inactive buttons should have a uniform semi-transparent white appearance on the dark gradient background, matching the style shown in the reference (gray rounded rectangles with white text/icons).

### Changes

**File: `src/pages/Activities.tsx` (lines 349-368)**

Update the button styling for all three action buttons:
- Inactive buttons: use `bg-white/10` background with `text-white/70` for consistent muted white text and icons
- Active button (Timeline): keep `bg-white text-foreground shadow-md` for the selected/white state  
- Ensure icon and text colors are explicitly set to white tones so they don't inherit theme accent colors
- Add `px-4` padding for better spacing to match the reference's wider button appearance

The key fix is changing from `text-primary-foreground/80` (which can resolve inconsistently) to explicit `text-white/70` for inactive and `text-white` opacity variants, ensuring uniform color across all inactive buttons.

