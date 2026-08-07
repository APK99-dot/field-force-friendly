-- Fix pg_net calls: the function lives in `net`, not `extensions`.
--
-- pg_net exposes exactly one http_post on this database:
--   net.http_post(url text, body jsonb DEFAULT '{}', params jsonb DEFAULT '{}',
--                 headers jsonb DEFAULT '{"Content-Type":"application/json"}',
--                 timeout_milliseconds integer DEFAULT 5000)
--
-- Two functions called `extensions.http_post`, which does not exist:
--
--   * report_dispatch_tick()   -> returned 'dispatch_failed'
--   * notify_push_on_insert()  -> raised, was swallowed by EXCEPTION WHEN
--                                 OTHERS into a warning, and so no push has
--                                 ever been sent from the database. The Vault
--                                 fix in 20260805140000 removed one cause and
--                                 left this one.
--
-- notify_push_on_insert also passed body as ::text; net.http_post takes jsonb.
--
-- Both now report the real error instead of a generic label — that swallowing
-- is what hid this for months.

CREATE OR REPLACE FUNCTION public.report_dispatch_tick()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_url text;
  v_secret text;
BEGIN
  SELECT function_url, trigger_secret INTO v_url, v_secret
  FROM public.report_dispatch_config WHERE id = true;

  IF COALESCE(v_url, '') = '' OR COALESCE(v_secret, '') = '' THEN
    RETURN 'not_configured';
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := v_url,
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', v_secret
      ),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN 'dispatch_failed: ' || SQLERRM;
  END;

  RETURN 'dispatched';
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_push_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_base text;
BEGIN
  SELECT functions_base_url INTO v_base
  FROM push_dispatch_config
  WHERE id = true AND is_enabled;

  IF v_base IS NULL THEN
    RAISE WARNING 'push skipped: push_dispatch_config missing or disabled (notification %)', NEW.id;
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := v_base || '/send-push-notification',
      body := jsonb_build_object(
        'user_id', NEW.user_id,
        'title',   NEW.title,
        'message', NEW.message
      ),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    -- Still never let a push failure roll back the notification — this fires
    -- inside check-in and check-out transactions.
    RAISE WARNING 'push failed for notification %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;
