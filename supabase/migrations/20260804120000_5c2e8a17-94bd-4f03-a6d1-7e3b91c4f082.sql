-- Audit trail for admin "login as user" (impersonation).
--
-- While impersonating, every action is recorded against the target user, so
-- without this table there is no way to tell afterwards whether the user did
-- something themselves or an admin did it as them. Insert-only by design: the
-- log must not be editable by the people it records.

-- No foreign keys to auth.users, deliberately. An audit record must outlive the
-- accounts it describes: if a user is deleted, the fact that they were
-- impersonated is exactly what you still need. A FK would either block the
-- deletion or erase the trail. The email columns are captured at write time so
-- the row stays readable once the account is gone.
CREATE TABLE public.admin_impersonation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  admin_email text,
  target_user_id uuid NOT NULL,
  target_email text,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_impersonation_log ENABLE ROW LEVEL SECURITY;

-- Readable by admins only.
CREATE POLICY "Admins can read impersonation log"
  ON public.admin_impersonation_log FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- No INSERT/UPDATE/DELETE policy for authenticated: rows are written by the
-- admin-login-as-user edge function using the service role, which bypasses RLS.
-- That keeps the trail append-only from the application's point of view.

CREATE INDEX idx_admin_impersonation_log_created_at
  ON public.admin_impersonation_log (created_at DESC);
CREATE INDEX idx_admin_impersonation_log_target
  ON public.admin_impersonation_log (target_user_id, created_at DESC);

GRANT SELECT ON public.admin_impersonation_log TO authenticated;
