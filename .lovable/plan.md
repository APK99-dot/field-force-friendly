

## Problem Analysis

The core issue is a **race condition**: the browser's `beforeinstallprompt` event fires once, early during page load. At that point, the user is on `/auth` and `AppLayout` (which contains `PWAInstallBanner`) is not mounted. By the time the user logs in and reaches `/dashboard`, the event has already fired and been lost.

The 3-second fallback timer does show the banner, but since `deferredPrompt` is null, the "Install Now" button just dismisses instead of triggering installation -- making it appear broken.

Additionally, the `BottomNav` component may visually overlap the fixed-bottom banner.

## Plan

### 1. Capture `beforeinstallprompt` globally before React mounts

In `index.html`, add a small inline script that listens for `beforeinstallprompt` immediately and stores it on `window.__deferredPWAPrompt`. This ensures the event is never lost regardless of which route the user is on.

### 2. Update PWAInstallBanner to read the global prompt

Modify the component to:
- Check `window.__deferredPWAPrompt` on mount (to recover a prompt that fired before mount)
- Still listen for the event in case it fires later
- Add bottom padding to account for `BottomNav` overlap (e.g., `bottom-16` or similar)

### 3. Add TypeScript declaration

Add a global type declaration for `window.__deferredPWAPrompt` to avoid TS errors.

### Files to modify
- `index.html` -- add inline script to capture prompt globally
- `src/components/PWAInstallBanner.tsx` -- read global prompt, fix bottom positioning
- `src/vite-env.d.ts` -- add Window interface extension

