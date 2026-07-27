CREATE TABLE IF NOT EXISTS public.backup_mirror_state (
  table_name text PRIMARY KEY,
  last_synced_at timestamptz NOT NULL DEFAULT '1970-01-01T00:00:00Z',
  last_run_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.backup_mirror_state TO service_role;
ALTER TABLE public.backup_mirror_state ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.backup_mirror_audit (
  id bigserial PRIMARY KEY,
  trace_id text,
  source_table text NOT NULL,
  destination_table text NOT NULL,
  row_count integer NOT NULL DEFAULT 0,
  status text NOT NULL,
  http_status integer,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.backup_mirror_audit TO service_role;
ALTER TABLE public.backup_mirror_audit ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_backup_mirror_audit_created_at
  ON public.backup_mirror_audit (created_at DESC);

CREATE POLICY "Admins can view backup mirror audit"
  ON public.backup_mirror_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view backup mirror state"
  ON public.backup_mirror_state FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));