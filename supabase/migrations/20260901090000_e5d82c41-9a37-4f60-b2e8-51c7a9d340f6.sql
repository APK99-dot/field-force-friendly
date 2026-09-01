-- TDS (Tax Deducted at Source) on vendor invoices.
--
-- Buyers deduct TDS on the taxable (pre-GST) amount before paying a vendor,
-- so the actual payment is less than the invoice total (e.g. taxable ₹20,600
-- + 18% GST = ₹24,308 invoiced; 1% TDS on taxable = ₹206; ₹24,102 paid).
-- Without recording the deduction such invoices forever show a residual
-- balance and the vendor row stays "Partially Paid" even though it is fully
-- settled.
--
-- tds_percentage is what the user enters on the invoice form; tds_amount is
-- the computed deduction (percentage applied to the invoice's taxable base)
-- stored alongside so readers never have to re-derive the taxable base from
-- line items. Existing invoices default to 0 — no TDS — so their balances
-- are unchanged.
ALTER TABLE public.procurement_invoices
  ADD COLUMN IF NOT EXISTS tds_percentage numeric NOT NULL DEFAULT 0;
ALTER TABLE public.procurement_invoices
  ADD COLUMN IF NOT EXISTS tds_amount numeric NOT NULL DEFAULT 0;
