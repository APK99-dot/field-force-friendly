

## Plan: Set Up Capacitor for APK Generation with Native Permissions

### What This Does
Converts the existing PWA into a native Android APK using Capacitor, ensuring camera, location, and other required permissions work properly within the native WebView.

### Features Requiring Native Permissions

| Feature | Permission Needed |
|---------|------------------|
| Attendance selfie (face verification) | Camera (`getUserMedia`) |
| Check-in/Check-out location | Geolocation |
| GPS Tracking (current location, day tracking) | Geolocation |
| Activity status change location capture | Geolocation |
| Visit check-in/check-out location | Geolocation |
| Photo uploads (profile, attendance) | Camera + Storage |

### Technical Steps

**1. Install Capacitor dependencies**
- `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`
- `@capacitor/camera`, `@capacitor/geolocation` (native plugins for reliable access)

**2. Create `capacitor.config.ts`**
- Set `appId: "app.lovable.8df6a1b7334f41738b22176a340f5d67"`
- Set `appName: "field-force-friendly"`
- Configure live-reload server URL pointing to the sandbox preview
- Add Android-specific settings for permissions

**3. Add Android permission declarations**
- Create/update `android/app/src/main/AndroidManifest.xml` permissions (this happens automatically via `npx cap add android`, but we document the required permissions):
  - `CAMERA`
  - `ACCESS_FINE_LOCATION`
  - `ACCESS_COARSE_LOCATION`
  - `ACCESS_BACKGROUND_LOCATION` (for GPS tracking)
  - `INTERNET`
  - `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE`

**4. Create a Capacitor permission helper utility** (`src/utils/nativePermissions.ts`)
- Detect if running inside Capacitor (`Capacitor.isNativePlatform()`)
- Provide helper functions that use Capacitor plugins (Camera, Geolocation) when native, and fall back to browser APIs when running as PWA
- This ensures the same codebase works in both browser and APK

**5. Update camera and location usage across the app**
- `CameraCapture.tsx` — Use `@capacitor/camera` when native, fallback to `getUserMedia`
- `useAttendance.ts`, `useVisits.ts`, `Activities.tsx`, `GPSTracking.tsx` — Use `@capacitor/geolocation` when native, fallback to browser geolocation
- This dual approach keeps the PWA working while enabling full native access in the APK

**6. Post-setup instructions for the user**
- Export project to GitHub
- Run `npm install` → `npx cap add android` → `npm run build` → `npx cap sync`
- Open in Android Studio: `npx cap open android`
- Build APK from Android Studio

### Files to Create/Modify
- `capacitor.config.ts` — New config file
- `src/utils/nativePermissions.ts` — New permission helper
- `src/components/CameraCapture.tsx` — Add Capacitor camera fallback
- `src/hooks/useAttendance.ts` — Use Capacitor geolocation
- `src/hooks/useVisits.ts` — Use Capacitor geolocation
- `src/pages/GPSTracking.tsx` — Use Capacitor geolocation
- `src/pages/Activities.tsx` — Use Capacitor geolocation
- `src/pages/Attendance.tsx` — Use Capacitor geolocation
- `package.json` — New Capacitor dependencies

