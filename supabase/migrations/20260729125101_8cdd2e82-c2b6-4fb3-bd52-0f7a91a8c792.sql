ALTER TABLE public.procurement_attachments
  ADD COLUMN IF NOT EXISTS version INT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_proc_attachments_po_doc_version
  ON public.procurement_attachments(po_id, version)
  WHERE scope = 'po_document';