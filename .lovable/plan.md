
Goal: fix both APK issues with the smallest high-impact changes:
1) make Dashboard feel instant on Android WebView
2) make “Record Audio” stable again without breaking voice-to-text

What I found

1. Dashboard is slow for two separate reasons
- The app eagerly imports every page in `src/App.tsx`, so the APK loads code for unrelated screens before Dashboard becomes interactive. The performance profile shows large route bundles and report libraries being loaded even on `/dashboard`.
- Dashboard data is fragmented:
  - `src/pages/Dashboard.tsx` calls `supabase.auth.getUser()` again
  - `src/hooks/useUserProfile.ts` fetches/auth bootstraps user data separately
  - `src/components/layout/AppLayout.tsx` separately fetches profile onboarding data
  - `src/hooks/useDashboard.ts` fires 6 independent dashboard queries, including full-row reads for activities/expenses just to calculate counts

2. Audio recorder issue is likely now in the native recorder lifecycle, not permissions
- Voice-to-text working means microphone access and native start/stop are at least partially working
- The more likely APK-only problems are:
  - `clearRecording()` calls native `cancelRecording()` asynchronously before every new start, which can race with `startRecording()`
  - native stop result parsing is too strict (`result.uri` only); Android plugin responses can vary by build/plugin version
  - the non-transcription “Record Audio” path needs a stronger “recording finalized” state so preview/attachment is not lost

Implementation plan

1. Cut Dashboard startup cost first
- Update `src/App.tsx` to lazy-load route pages with `React.lazy` + `Suspense`
- Keep the dashboard shell/app chrome lightweight so the APK WebView doesn’t parse admin/reports/projects code before first paint
- This should remove most of the “slow before anything shows” feeling

2. Consolidate repeated auth/profile fetches
- Refactor `src/hooks/useUserProfile.ts` into a shared React Query-backed current-user hook
- Reuse that shared data in:
  - `src/pages/Dashboard.tsx`
  - `src/components/layout/AppLayout.tsx`
  - `src/components/layout/AppHeader.tsx`
- Result: fewer duplicate auth/profile round-trips during startup

3. Split dashboard into fast core + background sections
- Replace the current single `useDashboard` pattern with:
  - `useDashboardCore`: only essential first paint data (user name/avatar already cached + today attendance status / start-day banner)
  - `useDashboardSecondary`: overview stats, activities, expenses, leave balances, charts/widgets
- Render the page shell immediately, then hydrate the remaining cards in the background

4. Combine dashboard API calls where it matters
- Add one backend summary function for secondary dashboard metrics instead of 5-6 separate reads
- The function should return current-user-only aggregates using the authenticated user on the server side, so no new access risk is introduced
- Keep leave balances either inside the same summary payload or as one separate secondary query if that keeps the function cleaner
- Also stop fetching full activity/expense row sets just to count/sum them

5. Add instant skeleton + cached snapshot behavior
- Use `src/components/ui/skeleton.tsx` in `src/pages/Dashboard.tsx` so header/banner/cards render immediately
- Cache the last successful dashboard payload in local storage and use it as initial data on app reopen in APK
- Then refresh in background via React Query so second load is much faster even after closing/reopening the app

6. Hard-fix native audio recording flow
- Refactor `src/hooks/useAudioRecorder.ts`:
  - stop using `cancelRecording()` as part of pre-start cleanup
  - split “discard local preview” from “cancel active native session”
  - only call native cancel when there is an active/unfinished native recording
  - normalize native stop result defensively (`uri` / `filePath` / equivalent)
  - keep a dedicated “finalizing recording” state until blob creation is complete
- This directly targets the APK race/regression while preserving the working voice-to-text path

7. Tighten Activities audio UI so APK state is obvious and stable
- Update `src/pages/Activities.tsx` to:
  - keep direct user-gesture start exactly as-is for microphone security rules
  - add explicit start/stop/finalizing states for “Record Audio”
  - prevent save/delete/restart while native stop is still finalizing
  - keep recorded audio preview attached reliably after stop until user saves or deletes it
- Voice-to-text flow stays separate and unchanged except for using the safer recorder internals

Files to change
- `src/App.tsx` — route-level lazy loading + suspense fallback
- `src/hooks/useUserProfile.ts` — shared cached current-user/profile query
- `src/components/layout/AppLayout.tsx` — reuse shared profile/onboarding data
- `src/components/layout/AppHeader.tsx` — reuse shared profile data
- `src/hooks/useDashboard.ts` — split into core/secondary + cached initial data
- `src/pages/Dashboard.tsx` — staged rendering + skeletons + background sections
- `src/hooks/useAudioRecorder.ts` — native recorder lifecycle fix
- `src/pages/Activities.tsx` — robust record-audio UX/state handling
- backend migration/function — combined dashboard summary function for current user

Technical notes
- No role model changes needed
- No insecure client-side admin logic will be introduced
- The dashboard summary function should read only the authenticated user’s data, so existing access rules remain intact
- For APK performance, the biggest win is code-splitting `App.tsx`; for dashboard data, the biggest win is replacing multiple small calls plus duplicate profile fetches with staged cached loading
- For audio, the biggest likely fix is removing the native `cancelRecording()` race from the pre-start path

Validation after implementation
1. Cold-open APK to Dashboard:
- app shell/header appears immediately
- banner/skeletons show first
- overview cards fill in afterwards
2. Reopen APK after first successful load:
- cached dashboard content appears instantly
- background refresh updates quietly
3. Record Audio in Activities:
- start recording
- stop recording
- preview remains visible
- save activity and confirm audio attachment exists
4. Voice-to-text still works end-to-end after the recorder refactor
