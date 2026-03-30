
Goal: remove “stale/cached version” behavior and make every new release reliably load the latest UI.

What I found from the code audit
1) App-side cache cleanup is already present:
- `src/main.tsx` unregisters all service workers on load.
- `src/main.tsx` clears `window.caches` on load.
2) PWA/service worker tooling is not active:
- No `vite-plugin-pwa`, no SW registration code, no manifest wiring in the codebase.
3) Your source code is newer than what is being served in at least one environment:
- `src/pages/Auth.tsx` currently has updated UI (“Sign In”, no Admin button, forgot-password toast).
- Fetched served HTML from the published URL still shows old text (“Sign In as User”, “Admin Sign In”).
4) Conclusion: this is most likely deployment/version staleness (published/CDN/native-webview) rather than browser cache alone.

Implementation plan
1) Clarify affected surface first (single quick check)
- Identify where stale UI appears: Preview URL, Published URL, APK/native app, or all.
- This decides whether we apply only web publish fixes or also native cache-busting.

2) Add release-version cache busting at app startup
- Introduce a build version constant (build timestamp/hash) from Vite.
- On boot, compare current build version vs last seen version in `localStorage`.
- If changed:
  - Clear Cache Storage
  - Unregister service workers (already present; keep it)
  - Remove only known app cache keys (e.g., dashboard cache keys), keep auth/session unless explicitly required
  - Force one-time hard reload with a guard flag to avoid reload loops

3) Make deployment identity visible for debugging
- Add a small non-intrusive build/version log (`console.info`) so we can confirm instantly if user is on latest build.
- Optional: add a hidden debug line in UI (admin/dev only) with build id.

4) Native container hardening (if issue also in APK)
- Add a version query token strategy for the remote web URL used by Capacitor (or runtime URL version stamping).
- This ensures WebView requests a fresh app shell when release changes.

5) Verification checklist
- Open Preview URL: confirm newest Auth UI appears.
- Open Published URL: confirm same UI/version as preview.
- If APK is used: confirm updated version appears after app relaunch.
- Confirm no infinite reload loop and normal login/session behavior.

Technical details (planned file touchpoints)
- `vite.config.ts`
  - Add `define` build constant (e.g., `__APP_BUILD_ID__`).
- `src/main.tsx`
  - Add version-check bootstrap (compare + selective clear + one-time reload guard).
  - Keep existing SW unregister + cache clear logic, but gate full reset to version changes.
- `src/utils/cacheVersion.ts` (new helper)
  - Encapsulate version compare/reset logic for cleaner startup.
- `capacitor.config.ts` (conditional, if APK affected)
  - Apply release-version URL token strategy.

Notes
- No backend/database changes needed.
- Root cause is very likely “served old deployment/version” rather than missing browser cache clear.
