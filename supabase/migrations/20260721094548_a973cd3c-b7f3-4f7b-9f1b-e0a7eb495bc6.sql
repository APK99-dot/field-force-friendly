
ALTER TABLE public.procurement_vendor_quotes
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_latest boolean NOT NULL DEFAULT true;

ALTER TABLE public.procurement_vendor_quotes
  DROP CONSTRAINT IF EXISTS procurement_vendor_quotes_po_id_vendor_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS procurement_vendor_quotes_latest_unique
  ON public.procurement_vendor_quotes (po_id, vendor_id)
  WHERE is_latest;

CREATE UNIQUE INDEX IF NOT EXISTS procurement_vendor_quotes_version_unique
  ON public.procurement_vendor_quotes (po_id, vendor_id, version);

CREATE INDEX IF NOT EXISTS procurement_vendor_quotes_po_vendor_idx
  ON public.procurement_vendor_quotes (po_id, vendor_id);
