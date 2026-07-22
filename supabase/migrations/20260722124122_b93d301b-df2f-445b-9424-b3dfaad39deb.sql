
ALTER TABLE public.procurement_orders           ADD COLUMN IF NOT EXISTS salesforce_id text;
ALTER TABLE public.procurement_items            ADD COLUMN IF NOT EXISTS salesforce_id text;
ALTER TABLE public.procurement_vendor_quotes    ADD COLUMN IF NOT EXISTS salesforce_id text;
ALTER TABLE public.procurement_vendor_quote_items ADD COLUMN IF NOT EXISTS salesforce_id text;
ALTER TABLE public.master_addresses             ADD COLUMN IF NOT EXISTS salesforce_id text;

CREATE UNIQUE INDEX IF NOT EXISTS procurement_orders_salesforce_id_key
  ON public.procurement_orders(salesforce_id) WHERE salesforce_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS procurement_items_salesforce_id_key
  ON public.procurement_items(salesforce_id) WHERE salesforce_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS procurement_vendor_quotes_salesforce_id_key
  ON public.procurement_vendor_quotes(salesforce_id) WHERE salesforce_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS procurement_vendor_quote_items_salesforce_id_key
  ON public.procurement_vendor_quote_items(salesforce_id) WHERE salesforce_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS master_addresses_salesforce_id_key
  ON public.master_addresses(salesforce_id) WHERE salesforce_id IS NOT NULL;
