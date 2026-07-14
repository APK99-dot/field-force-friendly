ALTER TABLE public.procurement_grns ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL;
ALTER TABLE public.procurement_invoices ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_procurement_grns_vendor_id ON public.procurement_grns(vendor_id);
CREATE INDEX IF NOT EXISTS idx_procurement_invoices_vendor_id ON public.procurement_invoices(vendor_id);