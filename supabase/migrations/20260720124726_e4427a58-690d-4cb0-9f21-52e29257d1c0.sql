
ALTER TABLE public.procurement_vendor_quotes
  ADD COLUMN IF NOT EXISTS first_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_resubmitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_by uuid;

-- Backfill first_submitted_at for previously submitted quotes
UPDATE public.procurement_vendor_quotes
SET first_submitted_at = submitted_at
WHERE first_submitted_at IS NULL AND submitted_at IS NOT NULL;

-- Normalize any legacy 'pending' rows to 'draft'
UPDATE public.procurement_vendor_quotes
SET status = 'draft'
WHERE status IS NULL OR status = 'pending';
