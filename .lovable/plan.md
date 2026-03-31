
I checked the current implementation and your screenshot context (issue appears in Preview, Published, and APK/WebView). The cache logic is close, but there are a few flaws that can still allow old UI to reappear intermittently.

### What is likely causing the intermittent fallback
1. **Reload guard logic is inconsistent**  
   In `cacheVersion.ts`, `syncWithServer()` sets guard to `serverBuild`, but `purgeAndReload()` immediately overwrites it with `currentBuild`. This weakens stale-build protection.

2. **Startup logic can “accept” an older build**  
   `checkAndBustCache()` can stamp whatever bundle loaded as the current build, even if that bundle is stale.

3. **Production sync runs in dev-style preview flows**  
   `public/build-meta.json` is `{"buildId":"dev"}` in source, so preview/dev behavior can mismatch runtime build IDs and cause unstable version checks.

4. **Main entry clears caches on every load**  
   `main.tsx` currently unregisters SW and clears caches on all boots, not only on mismatch. This adds churn but does not guarantee correct version convergence.

---

### Implementation plan to fix this permanently

1. **Refactor cache/version state machine (`src/utils/cacheVersion.ts`)**
   - Split “purge” and “state write” responsibilities.
   - Ensure guard is set to the **target build** and not overwritten.
   - Prevent old bundles from being marked as trusted/latest before server confirmation.

2. **Use robust forced reload strategy**
   - Replace plain `window.location.reload()` with a one-time URL cache-bypass token (`?__v=<targetBuild>`).
   - On successful load, remove the token via `history.replaceState` to keep clean URLs.
   - Keep one-loop protection via guard keys.

3. **Harden server-truth sync**
   - Keep `/build-meta.json` fetch with `cache: "no-store"` + unique timestamp.
   - Add defensive parsing/logging and a second fetch mode fallback if response is stale or malformed.
   - Only commit `BUILD_KEY` after confirmed server/build sync.

4. **Fix environment behavior**
   - Skip periodic server sync in dev/preview mode (`import.meta.env.DEV`) to avoid `dev` placeholder mismatches.
   - Keep strict sync enabled for production deployments.

5. **Clean up startup boot path (`src/main.tsx`)**
   - Remove unconditional cache/service-worker clearing from normal startup.
   - Run destructive purge only through version-mismatch path.
   - Keep periodic + visibility sync hooks in production.

6. **Native/WebView cache hardening (`capacitor.config.ts`)**
   - Add release version token to server URL for native builds (derived from app/package version), so each app release requests a fresh shell and avoids sticky WebView caches.

7. **Validation pass**
   - Verify on all three surfaces: Preview, Published URL, APK/WebView.
   - Confirm no regression after idle time (10–15 min), tab background/foreground, and route navigation.
   - Confirm logs show stable “running build == server build” after convergence and no reload loop.

---

### Technical details (files to update)
- `src/utils/cacheVersion.ts` (core fix; guard/state flow + hard reload token)
- `src/main.tsx` (boot cleanup + production-only sync wiring)
- `capacitor.config.ts` (native URL version token)
- `public/build-meta.json` + build output handling (keep as dev placeholder only; production value comes from build plugin)
- `vite.config.ts` (keep build meta generation; ensure consistency)

No backend/database changes are required.
