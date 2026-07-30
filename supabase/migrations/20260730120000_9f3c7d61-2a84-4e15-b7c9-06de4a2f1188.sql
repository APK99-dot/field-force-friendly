-- Report Subscriptions — scheduled-report engine (Bharath Builders native)
--
-- Phase 1: the dataset-INDEPENDENT half of the engine. This migration ships the
-- registry, the report definition/subscription/delivery tables, their RLS, and
-- the two RPCs the admin UI calls. It deliberately ships NO get_*_report dataset
-- functions and NO seed rows in reportable_datasets — datasets arrive in phase 2,
-- and the UI renders an explicit "no datasets yet" state until then. Seeding a
-- dataset whose `source` function does not exist would give the report builder a
-- dropdown entry that fails the moment anyone picks it.
--
-- Modelled on the report engine in staging-quickapp, but rewritten against this
-- app's identity model. Deviations are deliberate:
--
--   * RLS is admin-manage / authenticated-read, matching the Notification Centre
--     migration (20260730080000). The source gated on is_admin_or_manager(),
--     which does not exist in this database.
--   * report_all_managers() resolves managers from employees.manager_id AND
--     employees.secondary_manager_id, and reuses public.notif_pick_users() for
--     the active-user filter and display name. The source joined user_profiles /
--     profiles.is_active; neither exists here (this app uses profiles.user_status).
--   * public.notif_managers_up_chain(uuid) from the Notification Centre migration
--     is the upward-hierarchy primitive for per-recipient report scoping in
--     phase 2. It is NOT re-declared here.
--   * pdf_template / the PDF preview pipeline is omitted: it only has meaning
--     alongside the generate-report edge function, which is a later phase.
--
-- ADDITIVE ONLY, BY DESIGN. Four brand-new tables, two new functions, and
-- triggers attached only to the new tables. Nothing here ALTERs, DROPs or
-- attaches a trigger to any pre-existing object, so this is safe to run against
-- a live production database.

-- 1. reportable_datasets -------------------------------------------------------
-- The registry the report builder reads. `source` names the SETOF-jsonb RPC that
-- returns the rows for the dataset. Intentionally seeded with zero rows.
CREATE TABLE public.reportable_datasets (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  source text NOT NULL,
  dimensions jsonb NOT NULL DEFAULT '[]'::jsonb,
  measures jsonb NOT NULL DEFAULT '[]'::jsonb,
  supports_matrix boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reportable_datasets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read datasets"
  ON public.reportable_datasets FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage datasets"
  ON public.reportable_datasets FOR ALL
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_reportable_datasets_active
  ON public.reportable_datasets (key) WHERE is_active;

-- 2. report_definitions --------------------------------------------------------
-- What the report is: dataset + layout + the rows/columns/values/filters config
-- assembled in the builder.
CREATE TABLE public.report_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  dataset_key text NOT NULL REFERENCES public.reportable_datasets(key) ON DELETE RESTRICT,
  layout text NOT NULL CHECK (layout IN ('tabular','grouped','matrix')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.report_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read report definitions"
  ON public.report_definitions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage report definitions"
  ON public.report_definitions FOR ALL
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_report_definitions_dataset
  ON public.report_definitions (dataset_key);

-- 3. report_subscriptions ------------------------------------------------------
-- When and to whom the report goes out.
--
--   cadence         'today' fires once and is not rescheduled.
--   period_basis    'previous' = last completed period (yesterday / last week /
--                   last month); 'current' = period-to-date at fire time.
--   recipient_mode  'named_users' uses recipient_user_ids verbatim;
--                   'all_managers' recomputes from report_all_managers() at every
--                   run, so hierarchy edits are picked up without editing the
--                   subscription. In that mode recipient_user_ids stays empty and
--                   scope is forced to 'per_recipient'.
CREATE TABLE public.report_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  report_definition_id uuid NOT NULL REFERENCES public.report_definitions(id) ON DELETE CASCADE,
  cadence text NOT NULL
    CHECK (cadence IN ('today','daily','weekday','weekly','monthly')),
  fire_day text,
  fire_time time NOT NULL DEFAULT '08:00',
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  recipient_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  recipient_mode text NOT NULL DEFAULT 'named_users'
    CHECK (recipient_mode IN ('named_users','all_managers')),
  attachment_format text NOT NULL DEFAULT 'excel'
    CHECK (attachment_format IN ('excel','pdf','summary_only')),
  push_to_phone boolean NOT NULL DEFAULT true,
  scope text NOT NULL DEFAULT 'shared'
    CHECK (scope IN ('shared','per_recipient')),
  period_basis text NOT NULL DEFAULT 'current'
    CHECK (period_basis IN ('current','previous')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','draft')),
  last_fired_at timestamptz,
  last_scheduled_fire_at timestamptz,
  last_scheduled_period_key text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.report_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read subscriptions"
  ON public.report_subscriptions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage subscriptions"
  ON public.report_subscriptions FOR ALL
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_report_subs_status
  ON public.report_subscriptions (status) WHERE status = 'active';

CREATE INDEX idx_report_subs_recipients
  ON public.report_subscriptions USING GIN (recipient_user_ids);

CREATE INDEX idx_report_subs_definition
  ON public.report_subscriptions (report_definition_id);

-- 4. report_delivery_log -------------------------------------------------------
-- Append-only history: one row per (subscription, recipient, period, run).
-- subscription_id is nullable with ON DELETE SET NULL so deleting a subscription
-- does not erase the record of what was already delivered.
--
-- Note there is deliberately NO unique (subscription, recipient, period) index:
-- a manual re-run inside the same period is a legitimate second row. Idempotency
-- for *scheduled* runs is carried by report_subscriptions.last_scheduled_period_key.
CREATE TABLE public.report_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES public.report_subscriptions(id) ON DELETE SET NULL,
  recipient_user_id uuid NOT NULL,
  period text NOT NULL,
  trigger_type text NOT NULL DEFAULT 'scheduled'
    CHECK (trigger_type IN ('scheduled','manual')),
  notification_id uuid,
  storage_path text,
  in_app_status text,
  push_status text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.report_delivery_log ENABLE ROW LEVEL SECURITY;

-- Deliveries can name a storage path holding another person's data, so reads are
-- narrower than the three tables above: your own rows, or everything if admin.
CREATE POLICY "Recipients can read own delivery log"
  ON public.report_delivery_log FOR SELECT
  TO authenticated USING (auth.uid() = recipient_user_id);

CREATE POLICY "Admins can read all delivery log"
  ON public.report_delivery_log FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage delivery log"
  ON public.report_delivery_log FOR ALL
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_report_delivery_sub
  ON public.report_delivery_log (subscription_id, created_at DESC);

CREATE INDEX idx_report_delivery_recipient
  ON public.report_delivery_log (recipient_user_id, created_at DESC);

CREATE INDEX idx_report_delivery_sub_period_created
  ON public.report_delivery_log (subscription_id, period, created_at DESC);

-- 5. updated_at triggers — NEW TABLES ONLY -------------------------------------
-- public.update_updated_at_column() already exists in this database and is used
-- by employees, sites and others. Attaching it to the three new tables changes no
-- existing behaviour.
CREATE TRIGGER trg_reportable_datasets_updated
  BEFORE UPDATE ON public.reportable_datasets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_report_definitions_updated
  BEFORE UPDATE ON public.report_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_report_subscriptions_updated
  BEFORE UPDATE ON public.report_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. create_report_subscription() ----------------------------------------------
-- One call writes the definition and the subscription together, so a failure
-- part-way cannot leave an orphaned report_definitions row behind. SECURITY
-- DEFINER, therefore it re-checks the admin role itself — the RLS policies above
-- are bypassed inside this function.
CREATE OR REPLACE FUNCTION public.create_report_subscription(
  p_definition jsonb,
  p_subscription jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_def_id uuid;
  v_sub_id uuid;
  v_uid uuid := auth.uid();
  v_mode text := COALESCE(p_subscription->>'recipient_mode', 'named_users');
  v_scope text := COALESCE(p_subscription->>'scope', 'shared');
  v_recipients uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can create report subscriptions';
  END IF;

  IF COALESCE(p_definition->>'dataset_key', '') = '' THEN
    RAISE EXCEPTION 'A dataset is required';
  END IF;

  v_recipients := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(p_subscription->'recipient_user_ids'))::uuid[],
    '{}'::uuid[]
  );

  -- 'all_managers' is resolved fresh at every run, so the stored recipient list
  -- must be empty and the scope must be per-recipient — otherwise a manager
  -- would receive somebody else's whole tree.
  IF v_mode = 'all_managers' THEN
    v_recipients := '{}'::uuid[];
    v_scope := 'per_recipient';
  ELSIF array_length(v_recipients, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one recipient is required';
  END IF;

  INSERT INTO public.report_definitions (name, dataset_key, layout, config, created_by)
  VALUES (
    p_definition->>'name',
    p_definition->>'dataset_key',
    COALESCE(p_definition->>'layout', 'tabular'),
    COALESCE(p_definition->'config', '{}'::jsonb),
    v_uid
  )
  RETURNING id INTO v_def_id;

  INSERT INTO public.report_subscriptions (
    name, report_definition_id, cadence, fire_day, fire_time, timezone,
    recipient_user_ids, recipient_mode, attachment_format, push_to_phone,
    scope, period_basis, status, created_by
  )
  VALUES (
    p_subscription->>'name',
    v_def_id,
    COALESCE(p_subscription->>'cadence', 'daily'),
    NULLIF(p_subscription->>'fire_day', ''),
    COALESCE((p_subscription->>'fire_time')::time, '08:00'::time),
    COALESCE(NULLIF(p_subscription->>'timezone', ''), 'Asia/Kolkata'),
    v_recipients,
    v_mode,
    COALESCE(p_subscription->>'attachment_format', 'excel'),
    COALESCE((p_subscription->>'push_to_phone')::boolean, true),
    v_scope,
    COALESCE(p_subscription->>'period_basis', 'current'),
    COALESCE(p_subscription->>'status', 'active'),
    v_uid
  )
  RETURNING id INTO v_sub_id;

  RETURN v_sub_id;
END;
$$;

-- 7. report_all_managers() -----------------------------------------------------
-- Everyone who is somebody's manager right now — used by the 'all_managers'
-- recipient mode and shown live in the wizard as a count.
--
-- Reimplemented for this database. The source resolved this through user_profiles
-- and profiles.is_active, neither of which exists here, and it considered only
-- employees.manager_id. Here:
--   * both manager_id and secondary_manager_id count as managing;
--   * subordinates who have already exited no longer make their manager a manager;
--   * a manager who has exited is dropped;
--   * "is this person still a real, active account, and what do we call them?" is
--     answered by public.notif_pick_users() rather than repeating the
--     user_status / full_name / username coalesce here.
CREATE OR REPLACE FUNCTION public.report_all_managers()
RETURNS TABLE(user_id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH referenced AS (
    SELECT e.manager_id AS id
    FROM employees e
    WHERE e.manager_id IS NOT NULL
      AND (e.date_of_exit IS NULL OR e.date_of_exit > CURRENT_DATE)
    UNION
    SELECT e.secondary_manager_id AS id
    FROM employees e
    WHERE e.secondary_manager_id IS NOT NULL
      AND (e.date_of_exit IS NULL OR e.date_of_exit > CURRENT_DATE)
  )
  SELECT u.id AS user_id, u.name::text AS full_name
  FROM public.notif_pick_users() u
  JOIN referenced r ON r.id = u.id
  WHERE NOT EXISTS (
    SELECT 1 FROM employees me
    WHERE me.user_id = u.id
      AND me.date_of_exit IS NOT NULL
      AND me.date_of_exit <= CURRENT_DATE
  )
  ORDER BY 2;
$$;

-- 8. Grants --------------------------------------------------------------------
-- RLS governs row visibility; these are table-level privileges only. Nothing is
-- granted to anon.
GRANT SELECT ON public.reportable_datasets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_definitions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_subscriptions TO authenticated;
GRANT SELECT ON public.report_delivery_log TO authenticated;

GRANT ALL ON public.reportable_datasets TO service_role;
GRANT ALL ON public.report_definitions TO service_role;
GRANT ALL ON public.report_subscriptions TO service_role;
GRANT ALL ON public.report_delivery_log TO service_role;

GRANT EXECUTE ON FUNCTION public.create_report_subscription(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_all_managers() TO authenticated, service_role;
