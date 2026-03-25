## Plan: Dashboard Performance + Audio Recorder Fix — COMPLETED

### Changes Made

#### 1. Route-level code splitting (src/App.tsx)
- All route pages lazy-loaded with `React.lazy` + `Suspense`
- Only Auth page eagerly loaded; everything else loaded on demand
- Spinner fallback shown during chunk loading

#### 2. Dashboard data consolidation (src/hooks/useDashboard.ts)
- Replaced 6 separate queries with 1 RPC call (`get_dashboard_summary`)
- Attendance query kept separate for fast first-paint banner
- Added localStorage caching for instant re-open experience

#### 3. Dashboard skeleton UI (src/pages/Dashboard.tsx)
- Skeleton placeholders for attendance banner and overview cards
- Profile loading state shown in header area
- Cards render immediately, data fills in from cache then refreshes

#### 4. Backend RPC function (get_dashboard_summary)
- Single SECURITY DEFINER function returns all aggregate counts
- Uses auth.uid() server-side — no new access risks

#### 5. Native audio recorder lifecycle fix (src/hooks/useAudioRecorder.ts)
- Removed `cancelRecording()` from pre-start cleanup (was causing race condition)
- Added `isFinalizing` state for native stop → blob conversion
- Normalized stop result parsing (`uri`/`filePath`/`path`)
- Dynamic import of native plugins to avoid bundle issues

#### 6. Activities audio UI (src/pages/Activities.tsx)
- Save button disabled during recording/finalizing
- Finalizing indicator shown during native blob conversion
- Stop called with await to prevent premature state changes
