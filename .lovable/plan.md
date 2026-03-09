

## Problem
The app UI overlaps with the system status bar on Android APK WebView and iOS Safari/PWA because there's no safe-area-inset handling for the top of the screen.

## Plan

### 1. `index.html` — Add `viewport-fit=cover` to the viewport meta tag

### 2. `src/index.css` — Add safe-area top padding to body/#root
```css
body, #root {
  padding-top: env(safe-area-inset-top);
}
```

### 3. `src/components/layout/AppHeader.tsx` — Add safe-area top padding to the sticky navbar
Change the nav element to include `safe-top` class (already defined in CSS as `padding-top: env(safe-area-inset-top)`).

### Files
- `index.html` — viewport meta update
- `src/index.css` — body/root safe-area padding
- `src/components/layout/AppHeader.tsx` — navbar safe-area class

No changes to scrolling, bottom nav, or existing layout structure.

