-- Notification Centre — configuration layer (Bharath Builders native)
--
-- Modelled on the Notification Centre in staging-quickapp, but rewritten against
-- this app's own identity model rather than copied. Deviations are deliberate:
--
--   * Recipients resolve via user_roles/app_role and employees.manager_id.
--     The source used user_profiles JOIN security_profiles; user_profiles does
--     not exist in this database.
--   * Leaderboard, retailer-targeting and customer-portal branches are omitted —
--     they have no meaning in a construction workflow.
--   * Recipients are de-duplicated per rule, so one rule can never deliver the
--     same notification twice to one person.
--
-- SHIPS WITH NO TRIGGERS, DELIBERATELY. Check-in/check-out, leave and
-- regularization notifications are dispatched from the client via
-- src/utils/notificationHelpers.ts -> dispatch-notification. Attaching database
-- triggers here would make those events fire twice. Nothing in this migration
-- alters the notifications table or any existing object, so current behaviour is
-- untouched. With no rules configured, emit_notification_event() is inert.

-- 1. notification_event_types --------------------------------------------------
CREATE TABLE public.notification_event_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_code text UNIQUE NOT NULL,
  label text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.notification_event_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read event types"
  ON public.notification_event_types FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage event types"
  ON public.notification_event_types FOR ALL
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.notification_event_types (event_code, label, description) VALUES
  ('RECORD_CREATED',     'Record Created',     'A new record is created in a module'),
  ('RECORD_UPDATED',     'Record Updated',     'An existing record is updated'),
  ('RECORD_DELETED',     'Record Deleted',     'A record is deleted'),
  ('RECORD_APPROVED',    'Record Approved',    'A record is approved'),
  ('RECORD_REJECTED',    'Record Rejected',    'A record is rejected'),
  ('RECORD_SUBMITTED',   'Record Submitted',   'A record is submitted for approval'),
  ('TASK_ASSIGNED',      'Task Assigned',      'A task is assigned to a user'),
  ('ACTIVITY_COMPLETED', 'Activity Completed', 'An activity is marked complete'),
  ('COMMENT_ADDED',      'Comment Added',      'A comment is added to a record'),
  ('FILE_UPLOADED',      'File Uploaded',      'A file or photo is uploaded');

-- 2. notification_rules --------------------------------------------------------
CREATE TABLE public.notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  event_code text NOT NULL REFERENCES public.notification_event_types(event_code),
  source_table text NOT NULL,
  receiver_type text NOT NULL DEFAULT 'employee'
    CHECK (receiver_type IN ('employee','manager','hierarchy','role','specific_user','admin')),
  receiver_role text,
  receiver_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notification_channel text NOT NULL DEFAULT 'in_app'
    CHECK (notification_channel IN ('in_app','push')),
  title_template text NOT NULL DEFAULT '{user_name} - {module_name}',
  message_template text NOT NULL DEFAULT '{user_name} performed an action on {module_name}',
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read rules"
  ON public.notification_rules FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage rules"
  ON public.notification_rules FOR ALL
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_notification_rules_lookup
  ON public.notification_rules (event_code, source_table) WHERE is_active;

-- 3. notification_event_log ----------------------------------------------------
CREATE TABLE public.notification_event_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_code text NOT NULL,
  source_table text NOT NULL,
  record_id text NOT NULL,
  actor_user_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed boolean NOT NULL DEFAULT false,
  recipients_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read event log"
  ON public.notification_event_log FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can insert event log"
  ON public.notification_event_log FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE INDEX idx_notification_event_log_created_at
  ON public.notification_event_log (created_at DESC);

-- 4. notif_fill() — template rendering -----------------------------------------
-- Single definition of the placeholder set, so templates can never drift between
-- call sites. STABLE (not IMMUTABLE): it reads now().
CREATE OR REPLACE FUNCTION public.notif_fill(
  p_template text,
  p_actor_name text,
  p_module_name text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_timezone text DEFAULT 'Asia/Kolkata'
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    COALESCE(p_template, ''),
    '{user_name}',   COALESCE(NULLIF(p_actor_name, ''), 'Someone')),
    '{module_name}', COALESCE(p_module_name, '')),
    '{record_name}', COALESCE(p_metadata->>'record_name', '')),
    '{site_name}',   COALESCE(p_metadata->>'site_name', '')),
    '{date}',        COALESCE(
                       p_metadata->>'date',
                       TO_CHAR(now() AT TIME ZONE COALESCE(NULLIF(p_timezone,''), 'Asia/Kolkata'),
                               'DD Mon YYYY')));
$$;

-- 5. notif_managers_up_chain() -------------------------------------------------
-- Walks employees.manager_id upward. Depth-capped and cycle-guarded: a self- or
-- mutual-reporting loop in the data must not spin here.
CREATE OR REPLACE FUNCTION public.notif_managers_up_chain(p_user_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_chain uuid[] := '{}'::uuid[];
  v_current uuid := p_user_id;
  v_next uuid;
  v_depth integer := 0;
BEGIN
  WHILE v_depth < 10 LOOP
    SELECT manager_id INTO v_next
    FROM employees
    WHERE user_id = v_current;

    EXIT WHEN v_next IS NULL;
    EXIT WHEN v_next = ANY(v_chain);   -- cycle guard
    EXIT WHEN v_next = p_user_id;      -- self-reporting guard

    v_chain := v_chain || v_next;
    v_current := v_next;
    v_depth := v_depth + 1;
  END LOOP;

  RETURN v_chain;
END;
$$;

-- 6. emit_notification_event() -------------------------------------------------
-- Resolves every rule matching (event_code, source_table), collects recipients,
-- de-duplicates them, and writes one notification row each.
CREATE OR REPLACE FUNCTION public.emit_notification_event(
  p_event_code text,
  p_source_table text,
  p_record_id text,
  p_actor_user_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_log_id uuid;
  v_rule RECORD;
  v_recipients uuid[];
  v_receiver_id uuid;
  v_actor_name text;
  v_module_name text;
  v_record_uuid uuid;
  v_title text;
  v_message text;
  v_total integer := 0;
BEGIN
  INSERT INTO notification_event_log (event_code, source_table, record_id, actor_user_id, metadata)
  VALUES (p_event_code, p_source_table, p_record_id, p_actor_user_id, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_log_id;

  -- notifications.related_id is uuid; p_record_id is text. Store NULL rather than
  -- raising if a caller passes a non-uuid identifier.
  v_record_uuid := CASE
    WHEN p_record_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN p_record_id::uuid ELSE NULL END;

  SELECT COALESCE(NULLIF(full_name, ''), NULLIF(username, ''), 'Someone')
    INTO v_actor_name
  FROM profiles WHERE id = p_actor_user_id;

  v_module_name := INITCAP(REPLACE(p_source_table, '_', ' '));

  FOR v_rule IN
    SELECT * FROM notification_rules
    WHERE event_code = p_event_code
      AND source_table = p_source_table
      AND is_active = true
  LOOP
    v_recipients := '{}'::uuid[];

    CASE v_rule.receiver_type
      WHEN 'employee' THEN
        IF p_actor_user_id IS NOT NULL THEN
          v_recipients := ARRAY[p_actor_user_id];
        END IF;

      WHEN 'manager' THEN
        SELECT ARRAY_REMOVE(ARRAY[manager_id], NULL) INTO v_recipients
        FROM employees WHERE user_id = p_actor_user_id;

      WHEN 'hierarchy' THEN
        v_recipients := public.notif_managers_up_chain(p_actor_user_id);

      WHEN 'admin' THEN
        SELECT COALESCE(ARRAY_AGG(DISTINCT user_id), '{}'::uuid[]) INTO v_recipients
        FROM user_roles WHERE role = 'admin'::app_role;

      WHEN 'role' THEN
        SELECT COALESCE(ARRAY_AGG(DISTINCT user_id), '{}'::uuid[]) INTO v_recipients
        FROM user_roles WHERE role::text = v_rule.receiver_role;

      WHEN 'specific_user' THEN
        IF v_rule.receiver_user_id IS NOT NULL THEN
          v_recipients := ARRAY[v_rule.receiver_user_id];
        END IF;

      ELSE
        CONTINUE;
    END CASE;

    v_recipients := COALESCE(v_recipients, '{}'::uuid[]);
    IF array_length(v_recipients, 1) IS NULL THEN
      CONTINUE;
    END IF;

    v_title   := public.notif_fill(v_rule.title_template,   v_actor_name, v_module_name, p_metadata, v_rule.timezone);
    v_message := public.notif_fill(v_rule.message_template, v_actor_name, v_module_name, p_metadata, v_rule.timezone);

    -- DISTINCT so overlapping recipient sets deliver once per person per rule.
    FOR v_receiver_id IN SELECT DISTINCT unnest(v_recipients) LOOP
      CONTINUE WHEN v_receiver_id IS NULL;
      INSERT INTO notifications (user_id, title, message, type, related_table, related_id)
      VALUES (v_receiver_id, v_title, v_message, p_event_code, p_source_table, v_record_uuid);
      v_total := v_total + 1;
    END LOOP;
  END LOOP;

  UPDATE notification_event_log
     SET processed = true, recipients_count = v_total
   WHERE id = v_log_id;
END;
$$;

-- 7. notif_pick_users() — people picker for the admin UI ------------------------
CREATE OR REPLACE FUNCTION public.notif_pick_users()
RETURNS TABLE(id uuid, name text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id,
         COALESCE(NULLIF(p.full_name, ''), NULLIF(p.username, ''), 'Unnamed user') AS name,
         COALESCE((SELECT ur.role::text FROM user_roles ur
                    WHERE ur.user_id = p.id
                    ORDER BY ur.role LIMIT 1), 'user') AS role
  FROM profiles p
  WHERE COALESCE(p.user_status, 'active') = 'active'
  ORDER BY 2;
$$;

-- 8. notif_preview_recipients() — "who would this reach?" ----------------------
CREATE OR REPLACE FUNCTION public.notif_preview_recipients(
  p_receiver_type text,
  p_receiver_role text DEFAULT NULL,
  p_receiver_user_id uuid DEFAULT NULL,
  p_sample_actor uuid DEFAULT NULL
)
RETURNS TABLE(id uuid, name text, role text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := COALESCE(p_sample_actor, auth.uid());
  v_ids uuid[] := '{}'::uuid[];
BEGIN
  CASE p_receiver_type
    WHEN 'employee' THEN
      v_ids := ARRAY_REMOVE(ARRAY[v_actor], NULL);
    WHEN 'manager' THEN
      SELECT ARRAY_REMOVE(ARRAY[e.manager_id], NULL) INTO v_ids
      FROM employees e WHERE e.user_id = v_actor;
    WHEN 'hierarchy' THEN
      v_ids := public.notif_managers_up_chain(v_actor);
    WHEN 'admin' THEN
      SELECT COALESCE(ARRAY_AGG(DISTINCT ur.user_id), '{}'::uuid[]) INTO v_ids
      FROM user_roles ur WHERE ur.role = 'admin'::app_role;
    WHEN 'role' THEN
      SELECT COALESCE(ARRAY_AGG(DISTINCT ur.user_id), '{}'::uuid[]) INTO v_ids
      FROM user_roles ur WHERE ur.role::text = p_receiver_role;
    WHEN 'specific_user' THEN
      v_ids := ARRAY_REMOVE(ARRAY[p_receiver_user_id], NULL);
    ELSE
      v_ids := '{}'::uuid[];
  END CASE;

  RETURN QUERY
    SELECT u.id, u.name, u.role
    FROM public.notif_pick_users() u
    WHERE u.id = ANY(COALESCE(v_ids, '{}'::uuid[]));
END;
$$;

-- 9. notify_send_test() — admin "send test notification" -----------------------
-- Writes a single in-app notification to the caller. Admin-gated: without this
-- check any authenticated user could push arbitrary text to themselves.
CREATE OR REPLACE FUNCTION public.notify_send_test(
  p_title text DEFAULT 'Test notification',
  p_message text DEFAULT 'This is a test notification from the Notification Centre.'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
  END IF;

  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'admin role required');
  END IF;

  INSERT INTO notifications (user_id, title, message, type, related_table)
  VALUES (v_uid, p_title, p_message, 'TEST', 'notification_rules')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'notification_id', v_id);
END;
$$;

-- 10. Grants -------------------------------------------------------------------
-- RLS governs row visibility; these are table-level privileges only. Note the
-- source granted ALL to anon as well — omitted deliberately.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_event_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_rules TO authenticated;
GRANT SELECT, INSERT ON public.notification_event_log TO authenticated;

GRANT EXECUTE ON FUNCTION public.notif_fill(text, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notif_managers_up_chain(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notif_pick_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notif_preview_recipients(text, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_send_test(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.emit_notification_event(text, text, text, uuid, jsonb) TO authenticated;
