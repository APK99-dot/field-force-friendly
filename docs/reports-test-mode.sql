-- Test mode for the two end-of-day report subscriptions
-- ("Daily activity report" and "Daily PO status change report").
--
-- Run the blocks BY HAND, one at a time, in the Supabase SQL editor. Do not run
-- the whole file in one go — STEP 3 undoes STEP 2.
--
--   STEP 1  look up your own user id                      (read-only)
--   STEP 2  TEST MODE — deliver to you and nobody else     (writes)
--   STEP 3  GO LIVE   — restore the real recipient list    (writes)
--
-- WHY THIS IS SAFE
-- Two independent guards keep a test run off other people's phones:
--   * recipient_user_ids holds exactly one id — yours. generate-report loops
--     over that array and notifies nobody else, so "Run now" cannot reach
--     another admin even by accident.
--   * status stays 'paused'. report-dispatcher's cron path scans
--     `status = 'active'` only, so nothing fires unattended at 19:00; its
--     manual path looks the subscription up by id with no status filter, so the
--     Run now button still works.
-- Migration 20260911092000 already seeds both rows paused, so the second guard
-- is in place before you touch anything.


-- =============================================================================
-- STEP 1 — find your user id
-- =============================================================================
-- Read-only. Confirm exactly ONE row comes back and that it is you, holding the
-- admin role. If the name match is too loose or too tight, edit the ILIKE
-- patterns — STEP 2 uses the same WHERE clause.
SELECT
  p.id            AS user_id,
  p.full_name,
  p.username,
  u.email,
  p.user_status,
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role = 'admin'::app_role
  )               AS is_admin
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.id
WHERE p.full_name ILIKE '%suyog%'
   OR p.username  ILIKE '%suyog%'
   OR u.email     ILIKE '%suyog%'
ORDER BY p.full_name;


-- =============================================================================
-- STEP 2 — TEST MODE: both reports deliver to you only
-- =============================================================================
-- Writes. Sets recipient_user_ids to the single admin matched below, forces
-- recipient_mode to 'named_users' (the 'all_managers' mode ignores the array
-- and would re-widen the audience), and keeps both rows paused.
--
-- The `one` CTE returns a row only when the lookup matches EXACTLY one admin.
-- If it matches none or several, the UPDATE touches nothing and reports
-- "UPDATE 0" — go back to STEP 1 and tighten the patterns rather than guessing.
WITH target AS (
  SELECT DISTINCT p.id
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = p.id AND ur.role = 'admin'::app_role
        )
    AND (p.full_name ILIKE '%suyog%'
      OR p.username  ILIKE '%suyog%'
      OR u.email     ILIKE '%suyog%')
),
one AS (
  SELECT (ARRAY_AGG(id))[1] AS id
  FROM target
  HAVING COUNT(*) = 1
)
UPDATE public.report_subscriptions s
SET recipient_user_ids = ARRAY[one.id],
    recipient_mode     = 'named_users',
    -- One shared file rather than one per recipient: with a single recipient
    -- they are the same report, and 'shared' runs the dataset unscoped, which
    -- is what an admin sees.
    scope              = 'shared',
    status             = 'paused',
    updated_at         = now()
FROM one
WHERE s.name IN ('Daily activity report', 'Daily PO status change report');

-- Confirm before pressing Run now. Expect recipients = 1, status = 'paused',
-- and your own name in the recipient column.
SELECT
  s.name,
  s.status,
  s.fire_time,
  s.attachment_format,
  s.push_to_phone,
  s.scope,
  cardinality(s.recipient_user_ids) AS recipients,
  (SELECT string_agg(COALESCE(p.full_name, p.username, x.uid::text), ', ')
     FROM unnest(s.recipient_user_ids) AS x(uid)
     LEFT JOIN public.profiles p ON p.id = x.uid) AS recipient_names
FROM public.report_subscriptions s
WHERE s.name IN ('Daily activity report', 'Daily PO status change report')
ORDER BY s.name;

-- Now open Notification Centre > Report Subscriptions and press the ▶ Run now
-- button on each row. Check the result in My Reports, then re-run block 8 of
-- docs/verify-end-of-day-reports.sql to see the delivery-log rows.


-- =============================================================================
-- STEP 3 — GO LIVE: restore the real recipients and start the 19:00 schedule
-- =============================================================================
-- Writes. Only run this once the test output looks right.
--
-- Recipients, format, push flag and scope are copied from the live "Daily
-- check-out report" row, so all three evening reports go to the same people in
-- the same shape. If that subscription no longer exists the UPDATE touches
-- nothing — set the recipients by hand in the UI instead.
WITH template AS (
  SELECT recipient_user_ids, recipient_mode, attachment_format, push_to_phone, scope
  FROM public.report_subscriptions
  WHERE name = 'Daily check-out report'
  LIMIT 1
)
UPDATE public.report_subscriptions s
SET recipient_user_ids = t.recipient_user_ids,
    recipient_mode     = t.recipient_mode,
    attachment_format  = t.attachment_format,
    push_to_phone      = t.push_to_phone,
    scope              = t.scope,
    status             = 'active',
    updated_at         = now()
FROM template t
WHERE s.name IN ('Daily activity report', 'Daily PO status change report');

-- Expect status = 'active' and the same recipient count as the check-out report.
SELECT s.name, s.status, s.fire_time, s.timezone,
       cardinality(s.recipient_user_ids) AS recipients
FROM public.report_subscriptions s
WHERE s.name IN ('Daily activity report',
                 'Daily PO status change report',
                 'Daily check-out report')
ORDER BY s.name;
