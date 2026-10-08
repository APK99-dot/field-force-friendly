-- Other charges, round off and notes on a vendor invoice.
--
-- A vendor's bill is rarely just the PO lines: loading, freight, unloading and
-- similar extras arrive on the same invoice, and the final figure is usually
-- rounded to the rupee. Until now the form could only show the PO-derived
-- total, so any invoice carrying extras could not be entered truthfully and the
-- balance due was wrong by exactly those extras.
--
-- SHAPE — a child table, matching this module's own convention
-- procurement_invoice_numbers (20260827090000) and procurement_invoice_payments
-- are both child tables of procurement_invoices, replaced wholesale by the form
-- on save. Charges are the same kind of thing: a short, self-contained,
-- ordered list that nothing else references. A jsonb blob would have been
-- fewer lines but would not sum in SQL, and the procurement reports aggregate
-- invoice money in SQL.
--
-- round_off and notes are single values per invoice, so they are columns.
-- round_off is deliberately signed: rounding goes both ways.
--
-- WHAT invoice_amount MEANS NOW
-- It stays the FINAL payable figure — PO lines + charges + round off — which is
-- what it has always meant to every reader: the per-vendor financial summary
-- and "Fully Invoiced" test in ProcurementDetail (vendorLifecycleMap), the
-- payments report, the Salesforce importer, duplicate detection. Storing the
-- line-only subtotal there instead would have silently understated every one of
-- them. The components are kept alongside so the form can reconstruct the
-- breakdown when editing.
--
-- TDS is NOT charged on the extras. It is deducted on the taxable (pre-GST)
-- base of the PO lines, which is unchanged by anything here — the same base
-- tdsAmountOnTaxable() has always used.

CREATE TABLE IF NOT EXISTS public.procurement_invoice_charges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES public.procurement_invoices(id) ON DELETE CASCADE,
  label       text NOT NULL,
  amount      numeric NOT NULL DEFAULT 0,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_charges_invoice
  ON public.procurement_invoice_charges(invoice_id);

ALTER TABLE public.procurement_invoice_charges ENABLE ROW LEVEL SECURITY;

-- Mirrors procurement_invoice_numbers exactly: read for procurement readers,
-- write for admins and module_procurement editors.
DROP POLICY IF EXISTS "Procurement users read invoice charges" ON public.procurement_invoice_charges;
CREATE POLICY "Procurement users read invoice charges"
  ON public.procurement_invoice_charges FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_procurement', 'read'));

DROP POLICY IF EXISTS "Approvers manage invoice charges" ON public.procurement_invoice_charges;
CREATE POLICY "Approvers manage invoice charges"
  ON public.procurement_invoice_charges FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_procurement', 'edit'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role)
              OR public.can_access_object(auth.uid(), 'module_procurement', 'edit'));

ALTER TABLE public.procurement_invoices
  ADD COLUMN IF NOT EXISTS round_off numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes     text;

COMMENT ON COLUMN public.procurement_invoices.round_off IS
  'Signed rounding adjustment applied to the invoice total. Included in invoice_amount.';
COMMENT ON COLUMN public.procurement_invoices.notes IS
  'Free-text note against the vendor invoice.';

-- No backfill. Existing invoices carry no extras and no rounding, which is
-- exactly what a zero round_off, an empty charge list and a null note mean, so
-- their invoice_amount is already correct under the new definition.
