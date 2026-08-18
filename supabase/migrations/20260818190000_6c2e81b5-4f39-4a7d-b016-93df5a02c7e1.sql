-- Make the notifications INSERT trigger the single push sender, and turn it on.
--
-- Until now there were two senders. dispatch-notification inserted rows AND
-- pushed; the INSERT trigger then pushed again. Everything from that function
-- went out twice, so push_dispatch_config.is_enabled was left false — which
-- meant rule-driven notifications (PO raised, goods received, milestones)
-- never pushed at all, because inserting is the only thing they do.
--
-- dispatch-notification no longer pushes. It writes the rows and this trigger
-- sends, so every notification in the app — attendance, leave, procurement
-- rules, scheduled reports — now takes one identical path.
--
-- The trigger also forwards `route` from metadata. send-push-notification has
-- always accepted it (FCM data.route, and now the web-push payload), but the
-- trigger never had one to give: the report deep link points at
-- /my-reports?open=<delivery_log_id>, an id that cannot be derived from
-- related_id. dispatch-notification now writes it into metadata so it travels
-- with the row and tapping a report notification still opens the PDF.

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

  -- Deep link, when the writer supplied one.
  v_route := NULLIF(TRIM(COALESCE(NEW.metadata->>'route', '')), '');

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

-- Turn it on. Safe only because dispatch-notification has stopped pushing;
-- enabling this before that change would have doubled every notification.
UPDATE public.push_dispatch_config SET is_enabled = true, updated_at = now()
WHERE id = true;
