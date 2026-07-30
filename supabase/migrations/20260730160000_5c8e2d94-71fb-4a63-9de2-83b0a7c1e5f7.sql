-- Report Subscriptions — phase 3: delivery.
--
-- Phase 1 (20260730120000) shipped the tables, phase 2 (20260730140000) the four
-- dataset functions. This migration ships the storage half of the delivery
-- pipeline plus the operator-fillable config the scheduler reads. The three edge
-- functions that do the work — generate-report, report-dispatcher and
-- sign-report-file — are deployed separately.
--
-- ADDITIVE ONLY, BY DESIGN. One new private storage bucket, four new policies on
-- storage.objects (all scoped to that bucket), one new table, one new function.
-- No ALTER, no DROP, no trigger on any pre-existing object. Safe against a live
-- production database.
--
-- NOTHING IN THIS FILE CONTAINS A SECRET. The source repo shipped a live
-- service-role JWT inside a cron.schedule body (see its
-- 20260326095232_ef2567ad...sql); that is a credential leak into version
-- control and it is deliberately NOT reproduced. The dispatcher's URL and
-- trigger secret live in report_dispatch_config, seeded NULL for the operator
-- to fill in.

-- 1. report-files bucket -------------------------------------------------------
-- PRIVATE. A per-recipient report can contain another person's data, so nothing
-- here may be world-readable. Files are written only by the service role (from
-- generate-report) and read through short-lived signed URLs minted by
-- sign-report-file. Object keys are `<subscription_id>/<period_key>/<shared|recipient_id>.<ext>`.
--
-- Modelled on how every other private bucket is created in this repo
-- (employee-docs / attendance-photos in 20260224130522, pm-attachments in
-- 20260225114344), with the ON CONFLICT guard used by temp-downloads in
-- 20260319073410 so re-running is harmless.
INSERT INTO storage.buckets (id, name, public)
VALUES ('report-files', 'report-files', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage policies ----------------------------------------------------------
-- RLS on storage.objects is already enabled by Supabase; these policies only ADD
-- to it and every one of them is filtered to bucket_id = 'report-files', so no
-- existing bucket's behaviour changes.
--
-- Writes: service_role only. The edge function uploads with the service key, so
-- no authenticated INSERT/UPDATE/DELETE policy is granted for this bucket at all
-- — a signed-in user cannot plant or overwrite a report file.
CREATE POLICY "Service role manages report files"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'report-files')
  WITH CHECK (bucket_id = 'report-files');

-- Reads: admins, plus the people the file actually belongs to. This policy is
-- defence in depth — the normal read path is a signed URL, which does not
-- consult RLS at all — but it means a direct storage read cannot leak a report
-- to an authenticated user who was never a recipient.
--
-- (storage.foldername(name))[1] is the first path segment, i.e. the
-- subscription id. It is compared as text (rs.id::text = ...) rather than
-- casting the segment to uuid, so an unexpected folder name is simply no match
-- instead of a cast error.
--
-- Written with IN (...) rather than a correlated EXISTS on purpose:
-- public.report_subscriptions also has a `name` column, so an unqualified `name`
-- inside a correlated subquery would silently bind to the subscription's name
-- instead of the storage object's key. Keeping `name` outside every subquery
-- removes that trap entirely.
CREATE POLICY "Recipients can read own report files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'report-files'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR (storage.foldername(name))[1] IN (
        SELECT rs.id::text
        FROM public.report_subscriptions rs
        WHERE rs.created_by = auth.uid()
           OR auth.uid() = ANY (rs.recipient_user_ids)
      )
      -- recipient_mode = 'all_managers' keeps recipient_user_ids empty by
      -- design, so the delivery log is the authoritative record of who was sent
      -- this particular file.
      OR name IN (
        SELECT dl.storage_path
        FROM public.report_delivery_log dl
        WHERE dl.recipient_user_id = auth.uid()
          AND dl.storage_path IS NOT NULL
      )
    )
  );

-- 3. report_dispatch_config ----------------------------------------------------
-- Where the scheduler finds the report-dispatcher URL and the shared secret it
-- must send as `x-cron-secret`. Modelled on the source's push_config table, with
-- one deliberate change: BOTH columns are seeded NULL. The source seeded a live
-- project URL and generated a secret inline; seeding NULL means this migration
-- carries no environment-specific value and no credential, and the tick function
-- below is a no-op until an operator fills the row in.
--
-- Single-row table (id is a boolean PK fixed to true), same shape as push_config.
CREATE TABLE IF NOT EXISTS public.report_dispatch_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  function_url text,
  trigger_secret text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.report_dispatch_config ENABLE ROW LEVEL SECURITY;

-- Deliberately NO policies for anon or authenticated: this row holds a shared
-- secret. Only service_role (which bypasses RLS) and the SECURITY DEFINER
-- function below can read it.
GRANT ALL ON public.report_dispatch_config TO service_role;

INSERT INTO public.report_dispatch_config (id, function_url, trigger_secret)
VALUES (true, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.report_dispatch_config IS
  'Single-row config for the scheduled report dispatcher. function_url = the full https://<project>.supabase.co/functions/v1/report-dispatcher URL; trigger_secret = the value sent as the x-cron-secret header. Both are NULL until an operator sets them; report_dispatch_tick() no-ops while either is NULL. Never commit real values to version control.';

-- 4. report_dispatch_tick() ----------------------------------------------------
-- The thing a scheduler calls. It reads the URL and secret from the table above,
-- so no credential is ever written into a cron job definition, and it returns
-- 'not_configured' (rather than failing, or worse, calling something
-- unauthenticated) while the row is still NULL.
--
-- pg_net is already enabled in this database, in the `extensions` schema
-- (20260331065152), and public.notify_push_on_insert() already calls
-- extensions.http_post the same way.
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
  SELECT function_url, trigger_secret
    INTO v_url, v_secret
  FROM public.report_dispatch_config
  WHERE id = true;

  IF COALESCE(v_url, '') = '' OR COALESCE(v_secret, '') = '' THEN
    RETURN 'not_configured';
  END IF;

  BEGIN
    PERFORM extensions.http_post(
      url := v_url,
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', v_secret
      ),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    -- A scheduler tick must never leave an error in the cron job history that
    -- looks like data loss. The dispatcher itself logs everything it does.
    RETURN 'dispatch_failed';
  END;

  RETURN 'dispatched';
END;
$$;

REVOKE ALL ON FUNCTION public.report_dispatch_tick() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_dispatch_tick() TO service_role;

COMMENT ON FUNCTION public.report_dispatch_tick() IS
  'Pokes the report-dispatcher edge function using the URL and secret in report_dispatch_config. Returns not_configured / dispatched / dispatch_failed. Intended to be driven by pg_cron; scheduling is left to the operator.';

-- 5. SCHEDULING — deliberately NOT set up here ---------------------------------
-- No cron.schedule() call is made by this migration, for three reasons:
--   * This repo has never used pg_cron: there is not one cron.schedule() in
--     supabase/migrations, so a migration cannot assume the extension is even
--     installed on the target project.
--   * A cron job that embeds a function URL and a bearer token is exactly the
--     defect being avoided (see the header). Scheduling from SQL is only safe
--     via report_dispatch_tick(), which reads both from the table.
--   * A schedule is an environment decision, not a schema decision. Staging and
--     production want different cadences and different secrets.
--
-- To turn scheduled delivery on, an operator runs, once, in the SQL editor:
--
--   -- a) point the config at this project's dispatcher and set the secret.
--   --    Use the SAME value as the CRON_SECRET edge-function secret.
--   UPDATE public.report_dispatch_config
--      SET function_url    = 'https://<project-ref>.supabase.co/functions/v1/report-dispatcher',
--          trigger_secret  = '<the same value as the CRON_SECRET edge secret>',
--          updated_at      = now()
--    WHERE id = true;
--
--   -- b) schedule the tick. Every 15 minutes is enough: the dispatcher does
--   --    catch-up (it fires any occurrence whose time has passed today) and is
--   --    idempotent per occurrence via last_scheduled_period_key.
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   SELECT cron.schedule('report-dispatch-tick', '*/15 * * * *',
--                        $cron$SELECT public.report_dispatch_tick();$cron$);
--
-- Any external scheduler (GitHub Actions, an uptime pinger, Supabase's own
-- scheduled functions) works just as well — POST to the dispatcher with an
-- `x-cron-secret` header — and then step (b) can be skipped entirely.
