DROP INDEX IF EXISTS public.idx_proc_attachments_po_doc_version;

CREATE UNIQUE INDEX IF NOT EXISTS idx_proc_attachments_po_doc_version
  ON public.procurement_attachments(po_id, vendor_id, version)
  WHERE scope = 'po_document';

DROP TRIGGER IF EXISTS trg_prevent_client_delete_activity_events ON public.activity_events;
DROP TRIGGER IF EXISTS trg_prevent_client_delete_additional_expenses ON public.additional_expenses;