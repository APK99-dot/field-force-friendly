ALTER TABLE public.project_sites
  ADD COLUMN IF NOT EXISTS base_lat numeric,
  ADD COLUMN IF NOT EXISTS base_lng numeric,
  ADD COLUMN IF NOT EXISTS base_address text,
  ADD COLUMN IF NOT EXISTS geofence_radius_m integer NOT NULL DEFAULT 100;

ALTER TABLE public.activity_events
  ADD COLUMN IF NOT EXISTS check_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS check_in_lat numeric,
  ADD COLUMN IF NOT EXISTS check_in_lng numeric,
  ADD COLUMN IF NOT EXISTS check_in_address text,
  ADD COLUMN IF NOT EXISTS check_in_distance_m numeric,
  ADD COLUMN IF NOT EXISTS check_in_within_site boolean,
  ADD COLUMN IF NOT EXISTS check_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS check_out_lat numeric,
  ADD COLUMN IF NOT EXISTS check_out_lng numeric,
  ADD COLUMN IF NOT EXISTS check_out_address text;