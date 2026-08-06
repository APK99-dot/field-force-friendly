-- Attendance check-in / check-out reports.
--
-- No change to get_attendance_report(): its 'tabular' branch already returns
-- date, team_member, status, site, check_in_time, check_out_time and hours as a
-- fixed column set, and generate-report derives the file's columns from the
-- returned rows. The times were always in the output — the dataset registry just
-- never listed them, so the field picker did not offer them.
--
-- 1. Advertise the two time fields in the registry.
-- 2. Seed the morning check-in and evening check-out subscriptions.
--
-- Seeded ACTIVE, unlike the notification rules: these add a new capability
-- rather than replacing something already running, so there is no burst risk.
-- Nothing fires until report_dispatch_tick() is scheduled.

-- 1. Registry ------------------------------------------------------------------
UPDATE public.reportable_datasets
SET dimensions = '[
      {"key":"team_member","label":"Team member"},
      {"key":"status","label":"Status"},
      {"key":"date","label":"Date"},
      {"key":"site","label":"Site"},
      {"key":"check_in_time","label":"Check-in time"},
      {"key":"check_out_time","label":"Check-out time"}
    ]'::jsonb,
    updated_at = now()
WHERE key = 'attendance';

-- 2. Definitions + subscriptions ------------------------------------------------
-- Recipients are resolved at seed time to everyone holding the admin role. If
-- admins change later, edit the subscription in the UI — this is a starting
-- point, not a live-updating group.
WITH admins AS (
  SELECT COALESCE(ARRAY_AGG(DISTINCT user_id), '{}'::uuid[]) AS ids
  FROM public.user_roles
  WHERE role = 'admin'::app_role
),
defs AS (
  INSERT INTO public.report_definitions (name, dataset_key, layout, config)
  SELECT d.name, 'attendance', 'tabular',
         '{"rows":[],"columns":[],"values":[],"filters":{}}'::jsonb
  FROM (VALUES
    ('Daily check-in report'),
    ('Daily check-out report')
  ) AS d(name)
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
  CASE defs.name
    WHEN 'Daily check-in report'  THEN TIME '11:30'
    ELSE                               TIME '19:00'
  END,
  'Asia/Kolkata',
  admins.ids,
  'named_users',
  -- CSV rather than PDF: the PDF renderer here is minimal and carries no logo
  -- or branding yet. Switch these to 'pdf' in the UI once that is built.
  'excel',
  true,
  'shared',
  -- 'current' = the day the report fires, which is what both of these want.
  'current',
  'active'
FROM defs CROSS JOIN admins;
