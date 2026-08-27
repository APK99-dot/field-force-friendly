-- Let one invoice record carry several vendor invoice numbers.
--
-- Vendors sometimes split their paperwork across two or three invoice numbers
-- for what is, to us, a single billing against the PO. Until now the form
-- captured exactly one number and date.
--
-- The first number stays on procurement_invoices.invoice_number so every
-- existing reader — the payments report, the vendor tab, duplicate detection,
-- the Salesforce importer's salesforce_id matching — keeps working untouched.
-- This table holds the full list, first entry included, so the form has one
-- place to read from.

CREATE TABLE IF NOT EXISTS public.procurement_invoice_numbers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id     uuid NOT NULL REFERENCES public.procurement_invoices(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  invoice_date   date,
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_numbers_invoice
  ON public.procurement_invoice_numbers(invoice_id);

ALTER TABLE public.procurement_invoice_numbers ENABLE ROW LEVEL SECURITY;

-- Mirrors procurement_invoices exactly (20260619063905): read for procurement
-- readers, write for admins and module_procurement editors.
DROP POLICY IF EXISTS "Procurement users read invoice numbers" ON public.procurement_invoice_numbers;
CREATE POLICY "Procurement users read invoice numbers"
  ON public.procurement_invoice_numbers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_procurement', 'read'));

DROP POLICY IF EXISTS "Approvers manage invoice numbers" ON public.procurement_invoice_numbers;
CREATE POLICY "Approvers manage invoice numbers"
  ON public.procurement_invoice_numbers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_procurement', 'edit'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role)
              OR public.can_access_object(auth.uid(), 'module_procurement', 'edit'));

-- Backfill: every existing invoice becomes a one-entry list, so the form never
-- has to special-case records created before this change.
INSERT INTO public.procurement_invoice_numbers (invoice_id, invoice_number, invoice_date, sort_order)
SELECT i.id, COALESCE(i.invoice_number, ''), i.invoice_date, 0
  FROM public.procurement_invoices i
 WHERE NOT EXISTS (
   SELECT 1 FROM public.procurement_invoice_numbers n WHERE n.invoice_id = i.id
 );
