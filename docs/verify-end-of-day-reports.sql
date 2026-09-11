-- Verification script for the two end-of-day report subscriptions
-- (migrations 20260911090000, 20260911091000, 20260911092000).
--
-- READ-ONLY. Nothing here creates, updates or deletes a row. Paste it into the
-- Supabase SQL editor after the migrations have been applied and read the
-- result of each block. Every block is independent, so a failure in one does
-- not hide the others.

-- 1. Did the objects land? -----------------------------------------------------
-- Expect exactly one row per name, all four present.
SELECT 'table'    AS kind, 'procurement_status_events' AS name,
       to_regclass('public.procurement_status_events') IS NOT NULL AS present
UNION ALL
SELECT 'trigger', 'trg_log_procurement_status_event',
       EXISTS (SELECT 1 FROM pg_trigger
               WHERE tgname = 'trg_log_procurement_status_event'
                 AND NOT tgisinternal)
UNION ALL
SELECT 'function', 'get_activities_report',
       EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.proname = 'get_activities_report')
UNION ALL
SELECT 'function', 'get_procurement_status_changes_report',
       EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.proname = 'get_procurement_status_changes_report');

-- 2. Are the datasets registered and active? -----------------------------------
-- Expect two rows, is_active = true, source matching the function names above.
SELECT key, label, source, is_active
FROM public.reportable_datasets
WHERE key IN ('activities', 'procurement_status_changes')
ORDER BY key;

-- 3. Are the subscriptions configured the way they should be? ------------------
-- Expect two rows: cadence 'daily', fire_time 19:00:00, timezone Asia/Kolkata,
-- status 'active', and the same recipients / format / push flag as the existing
-- "Daily check-out report" row shown alongside them for comparison.
SELECT
  s.name,
  s.cadence,
  s.fire_time,
  s.timezone,
  s.status,
  s.attachment_format,
  s.push_to_phone,
  s.scope,
  s.period_basis,
  cardinality(s.recipient_user_ids) AS recipients,
  d.dataset_key,
  d.layout,
  d.config -> 'filters' ->> 'report_variant' AS report_variant,
  s.last_fired_at
FROM public.report_subscriptions s
JOIN public.report_definitions d ON d.id = s.report_definition_id
WHERE s.name IN ('Daily activity report',
                 'Daily PO status change report',
                 'Daily check-out report')
ORDER BY s.name;

-- 4. Did the PO status backfill produce anything? ------------------------------
-- Expect one 'backfill' row per stage_history entry across all existing POs.
-- 'trigger' rows appear from the moment the migration ran onwards.
SELECT event_source, COUNT(*) AS events, MIN(changed_at) AS earliest, MAX(changed_at) AS latest
FROM public.procurement_status_events
GROUP BY event_source
ORDER BY event_source;

-- 5. Dry-run both reports for TODAY --------------------------------------------
-- This is the same call generate-report makes: layout 'tabular', the variant
-- from the definition's config.filters, and today's date on both ends. A row
-- count of 0 is a valid answer (nothing happened today) — what matters is that
-- neither call raises.
SELECT 'activities' AS dataset, COUNT(*) AS rows_today
FROM public.get_activities_report(
  'tabular', NULL, NULL, '{}'::text[],
  jsonb_build_object(
    'report_variant', 'daily_created',
    'date_from', CURRENT_DATE::text,
    'date_to',   CURRENT_DATE::text
  )
)
UNION ALL
SELECT 'procurement_status_changes', COUNT(*)
FROM public.get_procurement_status_changes_report(
  'tabular', NULL, NULL, '{}'::text[],
  jsonb_build_object(
    'report_variant', 'daily_changes',
    'date_from', CURRENT_DATE::text,
    'date_to',   CURRENT_DATE::text
  )
);

-- 6. Eyeball the actual output -------------------------------------------------
-- Widen the window to the last 7 days so there is something to look at even on
-- a quiet day. The key order of each json row is the column order of the
-- delivered CSV/PDF, because generate-report reads Object.keys() of the first
-- row.
SELECT *
FROM public.get_activities_report(
  'tabular', NULL, NULL, '{}'::text[],
  jsonb_build_object(
    'report_variant', 'daily_created',
    'date_from', (CURRENT_DATE - 7)::text,
    'date_to',   CURRENT_DATE::text
  )
)
LIMIT 20;

SELECT *
FROM public.get_procurement_status_changes_report(
  'tabular', NULL, NULL, '{}'::text[],
  jsonb_build_object(
    'report_variant', 'daily_changes',
    'date_from', (CURRENT_DATE - 7)::text,
    'date_to',   CURRENT_DATE::text
  )
)
LIMIT 20;

-- 7. Confirm the trigger fires -------------------------------------------------
-- Not run here, because it writes. To check it by hand: move any PO to a new
-- status in the app, then re-run this and expect a fresh 'trigger' row.
SELECT changed_at, po_number, from_status, to_status, changed_by_name, is_auto, event_source
FROM public.procurement_status_events
ORDER BY changed_at DESC
LIMIT 10;

-- 8. After the 19:00 run -------------------------------------------------------
-- One delivery-log row per recipient per subscription per day.
SELECT s.name, l.trigger_type, l.period, l.created_at, l.recipient_user_id,
       l.storage_path, l.in_app_status, l.push_status, l.error
FROM public.report_delivery_log l
JOIN public.report_subscriptions s ON s.id = l.subscription_id
WHERE s.name IN ('Daily activity report', 'Daily PO status change report')
ORDER BY l.created_at DESC
LIMIT 20;
