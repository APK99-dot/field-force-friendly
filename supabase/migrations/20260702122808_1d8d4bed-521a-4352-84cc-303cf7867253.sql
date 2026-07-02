ALTER TABLE public.master_products
  ADD COLUMN IF NOT EXISTS product_description text,
  ADD COLUMN IF NOT EXISTS budgeted_rate numeric,
  ADD COLUMN IF NOT EXISTS lead_time_days integer,
  ADD COLUMN IF NOT EXISTS quality_instruction text,
  ADD COLUMN IF NOT EXISTS delivery_instruction text,
  ADD COLUMN IF NOT EXISTS salesforce_id text;

CREATE UNIQUE INDEX IF NOT EXISTS master_products_salesforce_id_key
  ON public.master_products (salesforce_id)
  WHERE salesforce_id IS NOT NULL;