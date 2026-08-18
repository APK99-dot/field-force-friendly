-- Deep-link push notifications to the record they are about.
--
-- Tapping a PO notification opened the dashboard, because the push carried no
-- route and sw.js falls back to "/". dispatch-notification supplies a route in
-- metadata for reports, but rule-driven notifications come from
-- emit_notification_event, which inserts without one.
--
-- Rather than thread a route through the rule engine, it is derived here from
-- the columns already on the row. related_table and related_id say exactly what
-- the notification is about, and Procurement.tsx already accepts ?po=<id>.
--
-- metadata.route still wins when present, so the report deep link — which
-- points at a delivery_log_id that cannot be derived from related_id — is
-- unaffected.

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

  -- An explicit route from the writer wins.
  v_route := NULLIF(TRIM(COALESCE(NEW.metadata->>'route', '')), '');

  -- Otherwise derive one from what the notification is about.
  IF v_route IS NULL AND NEW.related_id IS NOT NULL THEN
    v_route := CASE NEW.related_table
      WHEN 'procurement_orders' THEN '/procurement?po=' || NEW.related_id
      -- A goods receipt has no page of its own; the PO it belongs to is not on
      -- the notification row, so the list is as close as this can get.
      WHEN 'procurement_grns'   THEN '/procurement'
      WHEN 'attendance'         THEN '/attendance'
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
    -- Never let a push failure roll back the notification — this fires inside
    -- check-in and check-out transactions.
    RAISE WARNING 'push failed for notification %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;
