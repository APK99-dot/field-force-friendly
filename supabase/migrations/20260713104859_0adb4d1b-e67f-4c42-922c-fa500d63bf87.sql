ALTER TABLE public.procurement_items
  ADD COLUMN IF NOT EXISTS vendor_ids uuid[],
  ADD COLUMN IF NOT EXISTS rate_source text,
  ADD COLUMN IF NOT EXISTS rate_source_vendor_id uuid;

ALTER TABLE public.procurement_vendor_quotes
  ADD COLUMN IF NOT EXISTS procurement_item_ids uuid[];

-- Backfill existing PO-wide quotes to cover all line items of their PO
UPDATE public.procurement_vendor_quotes q
SET procurement_item_ids = sub.ids
FROM (
  SELECT procurement_id, array_agg(id) AS ids
  FROM public.procurement_items
  GROUP BY procurement_id
) sub
WHERE q.po_id = sub.procurement_id
  AND (q.procurement_item_ids IS NULL OR array_length(q.procurement_item_ids, 1) IS NULL);