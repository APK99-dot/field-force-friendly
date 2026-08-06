-- Fix database-driven push notifications.
--
-- notify_push_on_insert() (20260331065152) read SUPABASE_URL and
-- SUPABASE_SERVICE_ROLE_KEY from Vault and skipped silently when either was
-- missing:
--
--   IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN ... END IF;
--
-- The Vault is empty on this project, so that branch has never been taken and
-- no push has ever been sent from the database. Notifications written by
-- Postgres produced a bell entry and no banner, with no error anywhere. Only
-- the client path (dispatch-notification, which talks to FCM directly) has been
-- delivering push, which is why notifications arrived only when the sending
-- device stayed awake long enough to make that call.
--
-- This replaces the Vault lookup with a config table. No service-role key is
-- needed: send-push-notification is verify_jwt = false and uses its own
-- service role internally.

-- 1. Config --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_dispatch_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  functions_base_url text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_dispatch_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read push dispatch config"
  ON public.push_dispatch_config FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage push dispatch config"
  ON public.push_dispatch_config FOR ALL
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.push_dispatch_config (id, functions_base_url)
VALUES (true, 'https://ukqgdhsvyadjauscqvhl.supabase.co/functions/v1')
ON CONFLICT (id) DO NOTHING;

-- 2. Dispatch ------------------------------------------------------------------
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
    -- Warn rather than skip silently. The previous version's quiet return is
    -- exactly what hid this bug for months.
    RAISE WARNING 'push dispatch skipped: push_dispatch_config missing or disabled (notification %)', NEW.id;
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM extensions.http_post(
      url := v_base || '/send-push-notification',
      body := json_build_object(
        'user_id', NEW.user_id,
        'title',   NEW.title,
        'message', NEW.message
      )::text,
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never let a push failure roll back the notification itself. The bell
    -- entry matters more than the banner, and this trigger also fires inside
    -- check-in and check-out transactions.
    RAISE WARNING 'push dispatch failed for notification %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- The trigger from 20260331065152 stays as-is; only the function body changed.
