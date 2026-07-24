
CREATE TABLE public.procurement_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  po_id UUID NOT NULL REFERENCES public.procurement_orders(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  scope TEXT NOT NULL DEFAULT 'requisition',
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  content_type TEXT,
  salesforce_id TEXT UNIQUE,
  source TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.procurement_attachments TO authenticated;
GRANT ALL ON public.procurement_attachments TO service_role;
ALTER TABLE public.procurement_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read procurement attachments"
  ON public.procurement_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write procurement attachments"
  ON public.procurement_attachments FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX idx_procurement_attachments_po ON public.procurement_attachments(po_id);
CREATE INDEX idx_procurement_attachments_vendor ON public.procurement_attachments(vendor_id);

CREATE TABLE public.procurement_import_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requested_from DATE,
  requested_to DATE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  total INT DEFAULT 0,
  created INT DEFAULT 0,
  updated INT DEFAULT 0,
  failed INT DEFAULT 0,
  summary JSONB,
  triggered_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.procurement_import_runs TO authenticated;
GRANT ALL ON public.procurement_import_runs TO service_role;
ALTER TABLE public.procurement_import_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read import runs"
  ON public.procurement_import_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins write import runs"
  ON public.procurement_import_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
