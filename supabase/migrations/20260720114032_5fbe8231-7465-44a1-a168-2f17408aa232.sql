ALTER TABLE public.master_categories ADD COLUMN IF NOT EXISTS terms_and_conditions jsonb;
ALTER TABLE public.master_products ADD COLUMN IF NOT EXISTS terms_and_conditions jsonb;