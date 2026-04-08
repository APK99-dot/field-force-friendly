

## Plan: Fix Missing Check-in Photos in Live Attendance

### Root Cause
The `attendance-photos` storage bucket has an RLS policy that only allows users to view their **own** photos:
```sql
-- Current policy
bucket_id = 'attendance-photos' AND auth.uid() = storage.foldername(name)[1]
```

There is **no admin/manager SELECT policy** for `attendance-photos`. So when the admin views the Live Attendance table, `createSignedUrl` fails for every other user's photos, returning null — hence the `--` placeholders.

This is why only one employee (the logged-in user themselves) shows a photo.

### Fix
Add a storage RLS policy allowing admins to view all attendance photos.

### Implementation

**Step 1: Database migration**
Add a new storage SELECT policy:
```sql
CREATE POLICY "Admins can view all attendance photos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'attendance-photos'
  AND has_role(auth.uid(), 'admin'::app_role)
);
```

This mirrors the existing "Admins can view all employee photos" pattern already in place for the `employee-photos` bucket.

### Files
- One migration file (no frontend code changes needed)

### Why this is sufficient
- The `getSignedUrl` logic in `LiveAttendanceMonitoring.tsx` already correctly extracts paths and generates signed URLs
- The only reason it fails is the missing RLS permission
- Once admins can SELECT from the bucket, `createSignedUrl` will succeed and photos will appear for all employees

