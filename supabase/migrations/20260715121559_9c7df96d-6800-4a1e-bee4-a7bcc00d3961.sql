
ALTER TABLE public.procurement_vendor_quotes
  ADD COLUMN IF NOT EXISTS change_request_notes text,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

-- Seed default T&C list (idempotent)
INSERT INTO public.app_configuration (module, config_key, config_value)
VALUES (
  'procurement',
  'termsAndConditions',
  '["Payment shall be released as per the mutually agreed payment terms; delays in delivery may attract penalties.","Goods supplied must strictly meet the specifications and quality standards mentioned in this Indent Order; rejected material will be returned at vendor cost."]'::jsonb
)
ON CONFLICT (module, config_key) DO NOTHING;

-- Storage policies for vendor-quote-attachments (public read is automatic via bucket flag)
CREATE POLICY "Public can upload vendor quote attachments"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'vendor-quote-attachments');

CREATE POLICY "Public can read vendor quote attachments"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'vendor-quote-attachments');
