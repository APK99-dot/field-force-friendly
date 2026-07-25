
CREATE POLICY "Site photos are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'site-photos');

CREATE POLICY "Authenticated users can upload site photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'site-photos');

CREATE POLICY "Authenticated users can update site photos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'site-photos');

CREATE POLICY "Authenticated users can delete site photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'site-photos');
