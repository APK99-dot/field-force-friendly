

## Plan: Fix Remaining Issues — Microphone, Call Button, and APK Performance

### Problems Identified

1. **Call button**: Currently uses `<a href="tel:...">` which is unreliable in Android WebView. Needs to use programmatic approach with proper fallback chain.

2. **Microphone/Audio**: The current implementation looks correct with proper cleanup. The issue is likely that in the Capacitor remote-URL WebView, `getUserMedia` needs explicit Capacitor permission grants first before the browser API works. The `useNativeStartup` hook requests camera and location but **not microphone**.

3. **APK slowness**: The `QueryClient` is created with zero configuration — no `staleTime`, no `gcTime` (formerly `cacheTime`). Every navigation triggers fresh network requests for all data. On mobile networks this causes significant delays. Need to configure aggressive caching defaults.

---

### Changes

#### 1. Fix QueryClient caching (src/App.tsx)
Configure the `QueryClient` with sensible defaults:
- `staleTime: 5 * 60 * 1000` (5 minutes) — data is considered fresh, no refetch on mount
- `gcTime: 10 * 60 * 1000` (10 minutes) — keep unused cache longer
- `refetchOnWindowFocus: false` — prevents refetch every time app regains focus (common in WebView)
- `retry: 1` — reduce retry attempts on slow networks

#### 2. Fix microphone permission on native (src/utils/nativePermissions.ts or useNativeStartup)
Add microphone permission request using `navigator.mediaDevices.getUserMedia({ audio: true })` during startup, then immediately stop the stream. This primes the Android WebView to allow subsequent audio recording.

#### 3. Fix call button (src/pages/MyTeam.tsx)
Replace `<a href="tel:...">` with a `<button>` that uses a fallback chain:
```
window.open('tel:...', '_system')  →  window.location.href = 'tel:...'
```
This ensures the dialer opens in both WebView and browser contexts.

#### 4. Ensure mic cleanup before recording (src/hooks/useAudioRecorder.ts)
The current implementation already handles cleanup well. Minor improvement: add a global stream tracker to ensure no orphaned streams exist from startup permission priming.

---

### Files to Modify
- **src/App.tsx** — Add QueryClient default options for caching
- **src/hooks/useNativeStartup.ts** — Add microphone permission request
- **src/pages/MyTeam.tsx** — Fix call button with programmatic dialer trigger
- **src/hooks/useAudioRecorder.ts** — Minor: ensure startup streams don't conflict

