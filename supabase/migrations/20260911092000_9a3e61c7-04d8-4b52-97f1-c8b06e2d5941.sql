-- Seed the two end-of-day report subscriptions.
--
--   Daily activity report          — activities raised today
--   Daily PO status change report  — every purchase-order status move today
--
-- Both fire at 19:00 Asia/Kolkata, the same slot as the existing "Daily
-- check-out report" seeded in 20260805180000, so the evening arrives as one
-- batch of reports rather than a stream of per-record notifications.
--
-- DELIVERY SETTINGS ARE COPIED, NOT RE-DECIDED.
-- recipient_user_ids, recipient_mode, attachment_format, push_to_phone and
-- scope are read off the live "Daily check-out report" row. That subscription
-- has been edited in the UI since it was seeded (it is on PDF now, not the
-- seeded CSV), and these two are meant to land in the same inboxes, in the same
-- format, at the same moment. Falling back to the admin roster only matters on
-- a database where the check-out subscription was deleted.
--
-- SEEDED PAUSED, unlike the check-in / check-out pair in 20260805180000.
-- Those two replaced nothing and could safely start delivering. These two go to
-- every admin on the recipient list, and the first thing anyone will want is a
-- look at the output before it lands in other people's inboxes at 19:00. Paused
-- gives that for free: report-dispatcher's cron path scans
-- `status = 'active'` only, while its manual path looks the subscription up by
-- id with no status filter — so the "Run now" button works on a paused
-- subscription and the scheduler ignores it.
--
-- To go live, set status = 'active' on both rows (the UI toggle, or the GO LIVE
-- block in docs/reports-test-mode.sql). To rehearse against a single recipient
-- first, run the TEST MODE block in that same file before pressing Run now.
--
-- Idempotent on subscription name, the same guard 20260805180000 used, so
-- re-applying this migration will not create duplicates.

WITH template AS (
  -- The evening subscription whose delivery settings these two inherit.
  SELECT recipient_user_ids, recipient_mode, attachment_format, push_to_phone, scope
  FROM public.report_subscriptions
  WHERE name = 'Daily check-out report'
  LIMIT 1
),
admins AS (
  SELECT COALESCE(ARRAY_AGG(DISTINCT user_id), '{}'::uuid[]) AS ids
  FROM public.user_roles
  WHERE role = 'admin'::app_role
),
settings AS (
  SELECT
    COALESCE((SELECT recipient_user_ids FROM template), (SELECT ids FROM admins)) AS recipient_user_ids,
    COALESCE((SELECT recipient_mode     FROM template), 'named_users')            AS recipient_mode,
    COALESCE((SELECT attachment_format  FROM template), 'pdf')                    AS attachment_format,
    COALESCE((SELECT push_to_phone      FROM template), true)                     AS push_to_phone,
    COALESCE((SELECT scope              FROM template), 'shared')                 AS scope
),
defs AS (
  INSERT INTO public.report_definitions (name, dataset_key, layout, config)
  SELECT
    d.name,
    d.dataset_key,
    'tabular',
    jsonb_build_object(
      'rows',    '[]'::jsonb,
      'columns', '[]'::jsonb,
      'values',  '[]'::jsonb,
      -- The discriminator the dataset function reads to pick its digest column
      -- set. generate-report merges config.filters into p_filters on every run.
      'filters', jsonb_build_object('report_variant', d.variant)
    )
  FROM (VALUES
    ('Daily activity report',         'activities',                 'daily_created'),
    ('Daily PO status change report', 'procurement_status_changes', 'daily_changes')
  ) AS d(name, dataset_key, variant)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.report_subscriptions s WHERE s.name = d.name
  )
  RETURNING id, name
)
INSERT INTO public.report_subscriptions
  (name, report_definition_id, cadence, fire_time, timezone,
   recipient_user_ids, recipient_mode, attachment_format,
   push_to_phone, scope, period_basis, status)
SELECT
  defs.name,
  defs.id,
  'daily',
  TIME '19:00',
  'Asia/Kolkata',
  settings.recipient_user_ids,
  settings.recipient_mode,
  settings.attachment_format,
  settings.push_to_phone,
  settings.scope,
  -- 'current' = the day the report fires. At 19:00 that is today's work, which
  -- is what an end-of-day digest means.
  'current',
  -- See the note above: paused so the first delivery is a deliberate Run now.
  'paused'
FROM defs CROSS JOIN settings;
