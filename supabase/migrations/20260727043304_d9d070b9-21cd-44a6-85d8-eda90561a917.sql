CREATE TABLE public.site_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.project_sites(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('document','photo')),
  storage_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_site_files_site ON public.site_files(site_id, kind, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_files TO authenticated;
GRANT ALL ON public.site_files TO service_role;

ALTER TABLE public.site_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_files_select_auth" ON public.site_files
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "site_files_insert_auth" ON public.site_files
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "site_files_update_owner_or_admin" ON public.site_files
  FOR UPDATE TO authenticated
  USING (auth.uid() = uploaded_by OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = uploaded_by OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "site_files_delete_owner_or_admin" ON public.site_files
  FOR DELETE TO authenticated
  USING (auth.uid() = uploaded_by OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_site_files_updated_at
  BEFORE UPDATE ON public.site_files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();