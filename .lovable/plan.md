

## Plan: Implement Camera Selfie Capture with Face Verification for Attendance

### Problem
Clicking "Start My Day" / "End My Day" currently just calls `checkIn()`/`checkOut()` which records attendance with GPS only — no camera opens, no selfie is captured, and no face verification happens.

### What needs to happen (matching Staging-Quickapp exactly)

#### 1. Database Migration
- Add `onboarding_completed` boolean column to `profiles` table (default false)
- Add storage RLS policy: allow users to upload their own photos to `employee-photos` bucket (path pattern: `{user_id}/...`)

#### 2. Create `CameraCapture` Component
- New file: `src/components/CameraCapture.tsx`
- Full camera dialog with live video feed, face guide circle overlay, capture button, retake/confirm flow
- Front/back camera toggle, permission denied handling with retry
- Adapted from staging version — removes Capacitor-specific native code (not applicable to this web-only project), keeps all PWA/browser camera logic intact

#### 3. Create `ProfileSetupModal` Component
- New file: `src/components/ProfileSetupModal.tsx`
- On first login, checks if user has `profile_picture_url` set
- If not, shows modal prompting user to capture baseline face photo
- Uploads to `employee-photos/{userId}/baseline_{timestamp}.jpg`
- Updates `profiles.profile_picture_url` and `profiles.onboarding_completed`
- Can be skipped

#### 4. Create `useFaceMatching` Hook
- New file: `src/hooks/useFaceMatching.ts`
- Provides `compareImages()` function and status helpers
- Simulates face matching client-side (same as staging's implementation which uses random confidence for demo)

#### 5. Create `verify-face-match` Edge Function
- New file: `supabase/functions/verify-face-match/index.ts`
- Accepts baseline and attendance photo URLs
- Fetches both images, converts to base64
- Calls Lovable AI (Gemini 2.5 Flash) for face comparison
- Returns confidence percentage and match status
- Uses `LOVABLE_API_KEY` (already configured as a secret)

#### 6. Update Attendance Page (`src/pages/Attendance.tsx`)
- Import `CameraCapture` and face matching logic
- "Start My Day" and "End My Day" buttons now open camera dialog instead of directly calling checkIn/checkOut
- Flow: Button click → open camera → user captures selfie → upload to `attendance-photos/{userId}/attendance/{date}_{type}_{timestamp}.jpg` → get location → call `verify-face-match` edge function → record attendance with `face_verification_status` and `face_match_confidence` → show result toast
- Processing state indicator showing steps: Location → Photo Upload → Face Verification → Saving
- If face match fails first attempt (<50%), allow retry; bypass on second attempt
- If edge function is unavailable, bypass verification and proceed

#### 7. Update `useAttendance` Hook
- Modify `checkIn()` to accept optional photo path, location, and face match data
- Modify `checkOut()` similarly
- Store `face_verification_status`, `face_match_confidence`, `check_in_photo_url`, `check_out_photo_url` in attendance record

#### 8. Integrate `ProfileSetupModal` in App Layout
- Add to `AppLayout.tsx` so it appears on first login when profile picture is missing

### Technical Details
- Storage buckets `employee-photos` and `attendance-photos` already exist with correct RLS for attendance photos
- Need to add user self-upload policy for `employee-photos`
- `profiles` table already has `profile_picture_url` column
- `attendance` table already has `face_match_confidence`, `face_verification_status`, `check_in_photo_url`, `check_out_photo_url` columns
- `LOVABLE_API_KEY` secret is already configured for the edge function
- Edge function config needs `verify_jwt = false` in `supabase/config.toml`

