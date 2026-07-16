
ALTER TABLE public.procurement_orders
  ADD COLUMN IF NOT EXISTS terms_and_conditions jsonb;

ALTER TABLE public.procurement_vendor_quote_items
  ADD COLUMN IF NOT EXISTS quality_notes text;
