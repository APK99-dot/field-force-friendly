-- 1. Vendor quote attachments: private bucket, uploads only from the portal,
--    reads restricted to signed-in staff (served via signed URLs).
DROP POLICY IF EXISTS "Public can read vendor quote attachments" ON storage.objects;
DROP POLICY IF EXISTS "Public can upload vendor quote attachments" ON storage.objects;

CREATE POLICY "Vendor portal can upload quote attachments"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'vendor-quote-attachments');

CREATE POLICY "Staff can read vendor quote attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vendor-quote-attachments');

-- 2. Stop broadcasting the users directory (emails, phones, roles) over realtime.
ALTER PUBLICATION supabase_realtime DROP TABLE public.users;

-- 3. Notifications are created by database triggers / edge functions only.
DROP POLICY IF EXISTS "Authenticated can insert notifications" ON public.notifications;

CREATE POLICY "Service role can insert notifications"
  ON public.notifications FOR INSERT TO service_role
  WITH CHECK (true);