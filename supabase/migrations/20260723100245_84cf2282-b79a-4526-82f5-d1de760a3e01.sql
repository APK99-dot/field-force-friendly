ALTER TABLE public.procurement_invoices ADD COLUMN IF NOT EXISTS salesforce_id TEXT UNIQUE;
ALTER TABLE public.procurement_invoice_payments ADD COLUMN IF NOT EXISTS salesforce_id TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_proc_invoices_sfid ON public.procurement_invoices(salesforce_id);
CREATE INDEX IF NOT EXISTS idx_proc_invoice_payments_sfid ON public.procurement_invoice_payments(salesforce_id);