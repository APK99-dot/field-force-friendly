
ALTER TABLE public.master_addresses ADD COLUMN IF NOT EXISTS salesforce_id TEXT UNIQUE;
ALTER TABLE public.procurement_orders ADD COLUMN IF NOT EXISTS salesforce_id TEXT UNIQUE;
ALTER TABLE public.procurement_items ADD COLUMN IF NOT EXISTS salesforce_id TEXT UNIQUE;
ALTER TABLE public.procurement_vendor_quotes ADD COLUMN IF NOT EXISTS salesforce_id TEXT UNIQUE;
ALTER TABLE public.procurement_vendor_quote_items ADD COLUMN IF NOT EXISTS salesforce_id TEXT UNIQUE;
