-- Notify admins when a new activity is logged.
--
-- activity_events was left out of the 20260805100000 wiring: that migration
-- covered POs, GRNs, expenses and milestones only. Activities are now in live
-- use, so admins need the same push the other modules get.
--
-- Follows the established shape exactly — a trigger that calls
-- emit_notification_event(), plus a rule for it to match. Unlike the 2026-08-05
-- seed this rule is created ACTIVE, because it is being added on request rather
-- than staged for later switch-on.

-- 1. Trigger ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_activity_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_site text;
BEGIN
  SELECT site_name INTO v_site FROM project_sites WHERE id = NEW.site_id;

  PERFORM public.emit_notification_event(
    'RECORD_CREATED', 'activity_events', NEW.id::text, NEW.user_id,
    jsonb_build_object(
      'record_name', COALESCE(NULLIF(NEW.activity_name, ''), NEW.activity_type, 'Activity'),
      'site_name',   COALESCE(v_site, '')
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_activity_events ON public.activity_events;
CREATE TRIGGER trg_notify_activity_events
  AFTER INSERT ON public.activity_events
  FOR EACH ROW EXECUTE FUNCTION public.notify_activity_events();

-- 2. Rule ---------------------------------------------------------------------
INSERT INTO public.notification_rules
  (name, event_code, source_table, receiver_type, notification_channel,
   title_template, message_template, is_active)
SELECT 'Activity created — notify admins',
       'RECORD_CREATED', 'activity_events', 'admin', 'push',
       'New activity — {record_name}',
       '{user_name} logged {record_name} at {site_name} on {date}.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_rules
  WHERE name = 'Activity created — notify admins'
);

-- Re-runnable: if the rule already exists but was switched off, turn it on.
UPDATE public.notification_rules
   SET is_active = true
 WHERE name = 'Activity created — notify admins';

-- 3. Deep link ----------------------------------------------------------------
-- Extends the CASE from 20260818210000 with activity_events. Activities has no
-- per-record route, so the list page is the destination.
CREATE OR REPLACE FUNCTION public.notify_push_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_base  text;
  v_route text;
BEGIN
  SELECT functions_base_url INTO v_base
  FROM push_dispatch_config
  WHERE id = true AND is_enabled;

  IF v_base IS NULL THEN
    RAISE WARNING 'push skipped: push_dispatch_config missing or disabled (notification %)', NEW.id;
    RETURN NEW;
  END IF;

  v_route := NULLIF(TRIM(COALESCE(NEW.metadata->>'route', '')), '');

  IF v_route IS NULL AND NEW.related_id IS NOT NULL THEN
    v_route := CASE NEW.related_table
      WHEN 'procurement_orders' THEN '/procurement?po=' || NEW.related_id
      WHEN 'procurement_grns'   THEN '/procurement'
      WHEN 'attendance'         THEN '/attendance'
      WHEN 'activity_events'    THEN '/activities'
      ELSE NULL
    END;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := v_base || '/send-push-notification',
      body := jsonb_build_object(
        'user_id', NEW.user_id,
        'title',   NEW.title,
        'message', NEW.message
      ) || CASE WHEN v_route IS NULL
                THEN '{}'::jsonb
                ELSE jsonb_build_object('route', v_route)
           END,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'push failed for notification %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;
