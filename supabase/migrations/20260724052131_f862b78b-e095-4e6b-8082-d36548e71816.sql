
CREATE POLICY "auth read procurement-attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'procurement-attachments');
CREATE POLICY "auth write procurement-attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'procurement-attachments');
CREATE POLICY "auth update procurement-attachments"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'procurement-attachments');
CREATE POLICY "auth delete procurement-attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'procurement-attachments');
