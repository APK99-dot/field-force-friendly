
Goal: stop the app from falling back to old UI after a few minutes, even when Publish says “Up to date”.

What I verified from your project right now
1) The codebase is on the new auth UI (`Sign In` only, no `Admin Sign In` in `src/pages/Auth.tsx`).
2) Your two live domains are serving different builds:
   - `https://field-force-friendly.lovable.app` returns old auth HTML (`Sign In as User`, `Admin Sign In`).
   - `https://bb.quickapp.ai` returns newer auth HTML (`Sign In`).
3) Current cache busting only compares local build ID vs localStorage. If an older bundle is loaded again from edge/browser cache, it cannot reliably detect a newer deployment unless it first gets a fresh version signal from server.

Likely root cause
- Intermittent stale app-shell delivery (edge/browser/native webview cache path), plus domain-level build inconsistency.
- Existing `checkAndBustCache()` is good, but it’s “self-referential” (it trusts whichever bundle loaded), so it does not fully protect against old bundle reappearing later.

Implementation plan
1) Add a server-truth version file generated per build
- Create a build metadata file (example: `/build-meta.json`) containing the current build ID.
- Ensure this ID is derived once per build and reused consistently.

2) Upgrade cache guard to compare “running build” vs “server build”
- Extend `src/utils/cacheVersion.ts` with:
  - `getCurrentBuildId()` (from `__APP_BUILD_ID__`)
  - `fetchServerBuildId()` via `fetch('/build-meta.json?t=' + Date.now(), { cache: 'no-store' })`
  - `syncBuildAndForceRefreshIfStale()`
- If server build differs:
  - unregister SWs
  - clear Cache Storage
  - clear app data caches (`dashboard_cache_v1`, `dashboard_*`, `REACT_QUERY*`)
  - force hard reload with cache-bypass query param and one-time guard.

3) Run stale-build checks not only at startup
- In `src/main.tsx`, keep startup check.
- Add periodic/visibility checks:
  - on `visibilitychange` when tab becomes visible
  - interval (e.g. every 60–120s) while app is open
- This directly addresses “after a few minutes it becomes old UI”.

4) Improve observability so we can confirm fix instantly
- Keep console log for running build ID.
- Also log fetched server build ID and mismatch actions.
- This will let us prove whether fallback is from stale edge response or client cache path.

5) Normalize domain behavior
- Verify both `field-force-friendly.lovable.app` and `bb.quickapp.ai` resolve to same latest build after update.
- If mismatch persists, enforce users to open only canonical domain in shared links and installed shortcuts (old bookmarks often reopen stale route/origin).

Technical file touchpoints
- `vite.config.ts`
  - Build ID generation and build-meta emission hook.
- `src/utils/cacheVersion.ts`
  - Add server-version fetch + stale detection + stronger purge list + guarded hard reload.
- `src/main.tsx`
  - Wire startup + periodic + visibility-based version sync checks.
- (Optional) `src/vite-env.d.ts`
  - Keep build constant typing aligned if needed.

Validation checklist
1) Publish once after changes.
2) Open both domains and verify same auth UI.
3) Wait 10–15 minutes, revisit `/auth` and `/dashboard`; confirm no regression to old cards/buttons.
4) Confirm console always shows current build + server build, with no repeated reload loop.
5) Test in mobile/webview context if used, since that is where stale shell issues are most common.
