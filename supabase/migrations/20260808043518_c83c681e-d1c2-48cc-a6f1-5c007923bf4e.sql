ALTER TABLE public.procurement_vendor_feedback
  ALTER COLUMN delivery_timeliness DROP NOT NULL,
  ALTER COLUMN material_quality DROP NOT NULL,
  ALTER COLUMN quantity_accuracy DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS improvement_areas text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS activity_id uuid REFERENCES public.activity_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'grn';

CREATE INDEX IF NOT EXISTS idx_vendor_feedback_vendor ON public.procurement_vendor_feedback(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_feedback_activity ON public.procurement_vendor_feedback(activity_id);