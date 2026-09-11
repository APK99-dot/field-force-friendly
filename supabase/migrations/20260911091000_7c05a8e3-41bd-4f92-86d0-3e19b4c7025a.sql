-- Two new report datasets: activities, and purchase-order status changes.
--
-- Both follow the fixed five-parameter dataset contract established in
-- 20260730140000:
--   get_<x>_report(p_layout text, p_rows text, p_columns text,
--                  p_values text[], p_filters jsonb) RETURNS SETOF <json type>
-- and both are registered in reportable_datasets so the report wizard in
-- Notification Centre > Report Subscriptions offers them like any other.
--
-- SETOF json, NOT SETOF jsonb — the one deliberate deviation.
-- generate-report derives a file's column order from Object.keys() of the first
-- row (renderCsv and renderPdf, index.ts:647 and :902). jsonb does not store an
-- object's key order: it sorts keys by length, then bytewise. A jsonb row from
-- the PO digest below would therefore render as
--     To | From | Note | Site | Time | Vendor | Changed by | PO / Requisition
-- which puts the two-letter status column first and the PO number last. json
-- keeps the order the SELECT declares, and nothing downstream cares which of the
-- two types it gets: callDatasetRpc hands the rows straight through, and the
-- wizard's preview reads them the same way. The four datasets seeded in
-- 20260730140000 still return jsonb; they are not touched here.
--
-- REPORT VARIANTS
-- Each function has a tabular variant, selected by filters.report_variant, for
-- the end-of-day subscription seeded in the next migration. This is the same
-- discriminator get_attendance_report uses for check_in / check_out
-- (20260810090000): generate-report merges report_definitions.config.filters
-- into p_filters on every run, so a definition tagged with a variant gets the
-- narrower column set while a report someone builds by hand in the wizard
-- carries no variant and keeps the full one.
--
-- TIME ZONE
-- report-dispatcher computes a daily period as a bare calendar date in UTC, and
-- the two subscriptions that use these datasets fire at 19:00 Asia/Kolkata
-- (13:30 UTC), so the UTC and IST calendar dates agree at fire time. Rows are
-- selected on the IST calendar day, matching every timestamp the app displays.

-- 1. get_activities_report() ---------------------------------------------------
-- Activities from public.activity_events, the table useActivities.ts reads and
-- writes. Scoped by user hierarchy on activity_events.user_id — the person who
-- raised the activity — because that is the field "activities created by user"
-- refers to and the field the app treats as ownership.
--
-- Two date bases, because the two questions differ:
--   report_variant = 'daily_created' -> created_at, i.e. "what was raised today",
--                                       which is what an end-of-day digest wants
--                                       and what the individual notifications
--                                       fired on.
--   anything else                    -> activity_date, i.e. "what was scheduled
--                                       for these days", which is what a
--                                       hand-built activity report means.
--
-- Columns verified against 20260224 activity_events plus later ADD COLUMN
-- batches, and against src/integrations/supabase/types.ts: activity_code,
-- activity_name, activity_type, activity_date, status, total_hours, user_id,
-- site_id, created_at, check_in_at, check_out_at.
CREATE OR REPLACE FUNCTION public.get_activities_report(
  p_layout text,
  p_rows text,
  p_columns text,
  p_values text[],
  p_filters jsonb
)
RETURNS SETOF json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_date_to    date := COALESCE((p_filters->>'date_to')::date, CURRENT_DATE);
  v_date_from  date := COALESCE((p_filters->>'date_from')::date, v_date_to - 30);
  v_scope_user uuid := NULLIF(p_filters->>'scope_user_id', '')::uuid;
  v_user_ids   uuid[];
  v_measure    text := COALESCE(p_values[1], 'activity_count');
  v_row_key    text := COALESCE(NULLIF(p_rows, ''), 'team_member');
  v_col_key    text := COALESCE(NULLIF(p_columns, ''), 'status');
  v_variant    text := COALESCE(p_filters->>'report_variant', '');
  -- Select on the day the activity was raised rather than the day it is for.
  v_by_created boolean := (COALESCE(p_filters->>'report_variant', '') = 'daily_created');
  v_rec        json;
BEGIN
  IF v_date_from > v_date_to THEN
    v_date_from := v_date_to;
  END IF;
  IF v_date_from < v_date_to - 366 THEN
    v_date_from := v_date_to - 366;
  END IF;

  v_user_ids := public.report_scope_user_ids(v_scope_user);

  IF p_layout = 'tabular' THEN

    IF v_variant = 'daily_created' THEN
      -- End-of-day digest: what each person raised today, in the order they
      -- raised it, so the list reads as a timeline of the day's work.
      FOR v_rec IN
        SELECT to_json(t) FROM (
          SELECT
            TO_CHAR(a.created_at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM') AS "Created",
            COALESCE(NULLIF(a.activity_code, ''), '-')                      AS "Code",
            COALESCE(NULLIF(a.activity_name, ''), 'Untitled')               AS "Activity",
            INITCAP(REPLACE(COALESCE(a.activity_type, ''), '_', ' '))       AS "Type",
            COALESCE(NULLIF(pr.full_name, ''), NULLIF(pr.username, ''), 'Unknown') AS "Raised by",
            COALESCE(ps.site_name, '-')                                     AS "Site",
            TO_CHAR(a.activity_date, 'DD/MM/YYYY')                          AS "Activity date",
            INITCAP(REPLACE(COALESCE(a.status, ''), '_', ' '))              AS "Status"
          FROM public.activity_events a
          LEFT JOIN public.profiles pr ON pr.id = a.user_id
          LEFT JOIN public.project_sites ps ON ps.id = a.site_id
          WHERE (a.created_at AT TIME ZONE 'Asia/Kolkata')::date
                  BETWEEN v_date_from AND v_date_to
            AND (v_user_ids IS NULL OR a.user_id = ANY(v_user_ids))
          ORDER BY a.created_at ASC
          LIMIT 5000
        ) t
      LOOP RETURN NEXT v_rec; END LOOP;

    ELSE
      -- Hand-built activity reports: the full column set, on activity_date.
      FOR v_rec IN
        SELECT to_json(t) FROM (
          SELECT
            TO_CHAR(a.activity_date, 'DD/MM/YYYY')                          AS "Date",
            COALESCE(NULLIF(a.activity_code, ''), '-')                      AS "Code",
            COALESCE(NULLIF(a.activity_name, ''), 'Untitled')               AS "Activity",
            INITCAP(REPLACE(COALESCE(a.activity_type, ''), '_', ' '))       AS "Type",
            COALESCE(NULLIF(pr.full_name, ''), NULLIF(pr.username, ''), 'Unknown') AS "Raised by",
            COALESCE(ps.site_name, '-')                                     AS "Site",
            INITCAP(REPLACE(COALESCE(a.status, ''), '_', ' '))              AS "Status",
            COALESCE(TO_CHAR(a.check_in_at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM'), '-')  AS "Check-in",
            COALESCE(TO_CHAR(a.check_out_at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM'), '-') AS "Check-out",
            COALESCE(a.total_hours, 0)::numeric(10,2)                       AS "Hours"
          FROM public.activity_events a
          LEFT JOIN public.profiles pr ON pr.id = a.user_id
          LEFT JOIN public.project_sites ps ON ps.id = a.site_id
          WHERE a.activity_date BETWEEN v_date_from AND v_date_to
            AND (v_user_ids IS NULL OR a.user_id = ANY(v_user_ids))
          ORDER BY a.activity_date DESC, 5 ASC
          LIMIT 5000
        ) t
      LOOP RETURN NEXT v_rec; END LOOP;
    END IF;

  ELSIF p_layout = 'grouped' THEN
    FOR v_rec IN
      WITH base AS (
        SELECT
          COALESCE(NULLIF(pr.full_name, ''), NULLIF(pr.username, ''), 'Unknown') AS team_member,
          INITCAP(REPLACE(COALESCE(a.activity_type, ''), '_', ' ')) AS activity_type,
          INITCAP(REPLACE(COALESCE(a.status, ''), '_', ' '))        AS status,
          a.activity_date,
          to_char(a.activity_date, 'YYYY-MM')                       AS month,
          COALESCE(ps.site_name, 'Unassigned')                      AS site,
          COALESCE(a.total_hours, 0)::numeric                       AS hours,
          a.status                                                  AS raw_status
        FROM public.activity_events a
        LEFT JOIN public.profiles pr ON pr.id = a.user_id
        LEFT JOIN public.project_sites ps ON ps.id = a.site_id
        WHERE (
                CASE WHEN v_by_created
                     THEN (a.created_at AT TIME ZONE 'Asia/Kolkata')::date
                     ELSE a.activity_date
                END
              ) BETWEEN v_date_from AND v_date_to
          AND (v_user_ids IS NULL OR a.user_id = ANY(v_user_ids))
      )
      SELECT to_json(t) FROM (
        SELECT
          CASE v_row_key
            WHEN 'activity_type'  THEN activity_type
            WHEN 'status'         THEN status
            WHEN 'activity_date'  THEN activity_date::text
            WHEN 'month'          THEN month
            WHEN 'site'           THEN site
            ELSE team_member
          END AS grp,
          COUNT(*)::bigint                                   AS activity_count,
          COALESCE(SUM(hours), 0)::numeric(16,2)             AS total_hours,
          COUNT(*) FILTER (WHERE raw_status = 'completed')::bigint   AS completed,
          COUNT(*) FILTER (WHERE raw_status = 'in_progress')::bigint AS in_progress,
          COUNT(*) FILTER (WHERE raw_status = 'planned')::bigint     AS planned
        FROM base
        GROUP BY 1
        ORDER BY 1 ASC
        LIMIT 2000
      ) t
    LOOP RETURN NEXT v_rec; END LOOP;

  ELSIF p_layout = 'matrix' THEN
    FOR v_rec IN
      WITH base AS (
        SELECT
          COALESCE(NULLIF(pr.full_name, ''), NULLIF(pr.username, ''), 'Unknown') AS team_member,
          INITCAP(REPLACE(COALESCE(a.activity_type, ''), '_', ' ')) AS activity_type,
          INITCAP(REPLACE(COALESCE(a.status, ''), '_', ' '))        AS status,
          a.activity_date,
          to_char(a.activity_date, 'YYYY-MM')                       AS month,
          COALESCE(ps.site_name, 'Unassigned')                      AS site,
          COALESCE(a.total_hours, 0)::numeric                       AS hours
        FROM public.activity_events a
        LEFT JOIN public.profiles pr ON pr.id = a.user_id
        LEFT JOIN public.project_sites ps ON ps.id = a.site_id
        WHERE (
                CASE WHEN v_by_created
                     THEN (a.created_at AT TIME ZONE 'Asia/Kolkata')::date
                     ELSE a.activity_date
                END
              ) BETWEEN v_date_from AND v_date_to
          AND (v_user_ids IS NULL OR a.user_id = ANY(v_user_ids))
      ),
      enriched AS (
        SELECT
          CASE v_row_key
            WHEN 'activity_type'  THEN activity_type
            WHEN 'status'         THEN status
            WHEN 'activity_date'  THEN activity_date::text
            WHEN 'month'          THEN month
            WHEN 'site'           THEN site
            ELSE team_member
          END AS row_val,
          CASE v_col_key
            WHEN 'activity_type'  THEN activity_type
            WHEN 'status'         THEN status
            WHEN 'activity_date'  THEN activity_date::text
            WHEN 'month'          THEN month
            WHEN 'site'           THEN site
            ELSE team_member
          END AS col_val,
          hours
        FROM base
      ),
      agg AS (
        SELECT
          row_val,
          col_val,
          CASE v_measure
            WHEN 'total_hours' THEN COALESCE(SUM(hours), 0)::numeric(16,2)
            ELSE                    COUNT(*)::numeric
          END AS val
        FROM enriched
        GROUP BY row_val, col_val
      )
      SELECT json_build_object(v_row_key, row_val, v_col_key, col_val, v_measure, val)
      FROM agg
      WHERE val IS NOT NULL
      ORDER BY row_val, col_val
      LIMIT 5000
    LOOP RETURN NEXT v_rec; END LOOP;
  END IF;

  RETURN;
END;
$$;

-- 2. get_procurement_status_changes_report() -----------------------------------
-- Every purchase-order status move, from public.procurement_status_events (the
-- audit table added in the previous migration). One row per change, not per PO,
-- so a PO that moved three times in a day appears three times — which is the
-- point of a change log and the difference between this and the existing
-- procurement_orders dataset.
--
-- Scoped by site, like get_procurement_orders_report: a non-admin recipient sees
-- only changes on the sites they or their reports are assigned to, and changes
-- on a PO with no site are visible only on an unscoped (shared / admin) run.
CREATE OR REPLACE FUNCTION public.get_procurement_status_changes_report(
  p_layout text,
  p_rows text,
  p_columns text,
  p_values text[],
  p_filters jsonb
)
RETURNS SETOF json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_date_to    date := COALESCE((p_filters->>'date_to')::date, CURRENT_DATE);
  v_date_from  date := COALESCE((p_filters->>'date_from')::date, v_date_to - 30);
  v_scope_user uuid := NULLIF(p_filters->>'scope_user_id', '')::uuid;
  v_site_ids   uuid[];
  v_measure    text := COALESCE(p_values[1], 'change_count');
  v_row_key    text := COALESCE(NULLIF(p_rows, ''), 'to_status');
  v_col_key    text := COALESCE(NULLIF(p_columns, ''), 'site');
  v_variant    text := COALESCE(p_filters->>'report_variant', '');
  v_rec        json;
BEGIN
  IF v_date_from > v_date_to THEN
    v_date_from := v_date_to;
  END IF;
  IF v_date_from < v_date_to - 366 THEN
    v_date_from := v_date_to - 366;
  END IF;

  v_site_ids := public.report_scope_site_ids(v_scope_user);

  IF p_layout = 'tabular' THEN

    IF v_variant = 'daily_changes' THEN
      -- End-of-day digest: no Date column, because every row is today. Ordered
      -- oldest first so the file reads as the day's sequence of moves.
      FOR v_rec IN
        SELECT to_json(t) FROM (
          SELECT
            TO_CHAR(e.changed_at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM') AS "Time",
            COALESCE(NULLIF(e.po_number, ''), NULLIF(e.requisition_number, ''), '-') AS "PO / Requisition",
            COALESCE(ps.site_name, '-')                       AS "Site",
            COALESCE(v.name, '-')                             AS "Vendor",
            COALESCE(e.from_status, 'New')                    AS "From",
            COALESCE(e.to_status, 'Unknown')                  AS "To",
            CASE WHEN e.is_auto THEN 'Automatic'
                 ELSE COALESCE(NULLIF(e.changed_by_name, ''), 'System') END AS "Changed by",
            COALESCE(NULLIF(e.note, ''), '-')                 AS "Note"
          FROM public.procurement_status_events e
          LEFT JOIN public.project_sites ps ON ps.id = e.site_id
          LEFT JOIN public.vendors v ON v.id = e.vendor_id
          WHERE (e.changed_at AT TIME ZONE 'Asia/Kolkata')::date
                  BETWEEN v_date_from AND v_date_to
            AND (v_site_ids IS NULL OR e.site_id = ANY(v_site_ids))
          ORDER BY e.changed_at ASC
          LIMIT 5000
        ) t
      LOOP RETURN NEXT v_rec; END LOOP;

    ELSE
      FOR v_rec IN
        SELECT to_json(t) FROM (
          SELECT
            TO_CHAR(e.changed_at AT TIME ZONE 'Asia/Kolkata', 'DD/MM/YYYY') AS "Date",
            TO_CHAR(e.changed_at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM') AS "Time",
            COALESCE(NULLIF(e.po_number, ''), NULLIF(e.requisition_number, ''), '-') AS "PO / Requisition",
            COALESCE(ps.site_name, '-')                       AS "Site",
            COALESCE(v.name, '-')                             AS "Vendor",
            COALESCE(e.from_status, 'New')                    AS "From",
            COALESCE(e.to_status, 'Unknown')                  AS "To",
            CASE WHEN e.is_auto THEN 'Automatic'
                 ELSE COALESCE(NULLIF(e.changed_by_name, ''), 'System') END AS "Changed by",
            COALESCE(NULLIF(e.note, ''), '-')                 AS "Note"
          FROM public.procurement_status_events e
          LEFT JOIN public.project_sites ps ON ps.id = e.site_id
          LEFT JOIN public.vendors v ON v.id = e.vendor_id
          WHERE (e.changed_at AT TIME ZONE 'Asia/Kolkata')::date
                  BETWEEN v_date_from AND v_date_to
            AND (v_site_ids IS NULL OR e.site_id = ANY(v_site_ids))
          ORDER BY e.changed_at DESC
          LIMIT 5000
        ) t
      LOOP RETURN NEXT v_rec; END LOOP;
    END IF;

  ELSIF p_layout = 'grouped' THEN
    FOR v_rec IN
      WITH base AS (
        SELECT
          COALESCE(e.to_status, 'Unknown')     AS to_status,
          COALESCE(e.from_status, 'New')       AS from_status,
          COALESCE(ps.site_name, 'Unassigned') AS site,
          COALESCE(v.name, 'Unassigned')       AS vendor,
          CASE WHEN e.is_auto THEN 'Automatic'
               ELSE COALESCE(NULLIF(e.changed_by_name, ''), 'System') END AS changed_by,
          (e.changed_at AT TIME ZONE 'Asia/Kolkata')::date AS change_date,
          to_char(e.changed_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS month,
          e.order_id
        FROM public.procurement_status_events e
        LEFT JOIN public.project_sites ps ON ps.id = e.site_id
        LEFT JOIN public.vendors v ON v.id = e.vendor_id
        WHERE (e.changed_at AT TIME ZONE 'Asia/Kolkata')::date
                BETWEEN v_date_from AND v_date_to
          AND (v_site_ids IS NULL OR e.site_id = ANY(v_site_ids))
      )
      SELECT to_json(t) FROM (
        SELECT
          CASE v_row_key
            WHEN 'from_status' THEN from_status
            WHEN 'site'        THEN site
            WHEN 'vendor'      THEN vendor
            WHEN 'changed_by'  THEN changed_by
            WHEN 'change_date' THEN change_date::text
            WHEN 'month'       THEN month
            ELSE to_status
          END AS grp,
          COUNT(*)::bigint                        AS change_count,
          COUNT(DISTINCT order_id)::bigint        AS orders_touched
        FROM base
        GROUP BY 1
        ORDER BY 1 ASC
        LIMIT 2000
      ) t
    LOOP RETURN NEXT v_rec; END LOOP;

  ELSIF p_layout = 'matrix' THEN
    FOR v_rec IN
      WITH base AS (
        SELECT
          COALESCE(e.to_status, 'Unknown')     AS to_status,
          COALESCE(e.from_status, 'New')       AS from_status,
          COALESCE(ps.site_name, 'Unassigned') AS site,
          COALESCE(v.name, 'Unassigned')       AS vendor,
          CASE WHEN e.is_auto THEN 'Automatic'
               ELSE COALESCE(NULLIF(e.changed_by_name, ''), 'System') END AS changed_by,
          (e.changed_at AT TIME ZONE 'Asia/Kolkata')::date AS change_date,
          to_char(e.changed_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS month,
          e.order_id
        FROM public.procurement_status_events e
        LEFT JOIN public.project_sites ps ON ps.id = e.site_id
        LEFT JOIN public.vendors v ON v.id = e.vendor_id
        WHERE (e.changed_at AT TIME ZONE 'Asia/Kolkata')::date
                BETWEEN v_date_from AND v_date_to
          AND (v_site_ids IS NULL OR e.site_id = ANY(v_site_ids))
      ),
      enriched AS (
        SELECT
          CASE v_row_key
            WHEN 'from_status' THEN from_status
            WHEN 'site'        THEN site
            WHEN 'vendor'      THEN vendor
            WHEN 'changed_by'  THEN changed_by
            WHEN 'change_date' THEN change_date::text
            WHEN 'month'       THEN month
            ELSE to_status
          END AS row_val,
          CASE v_col_key
            WHEN 'from_status' THEN from_status
            WHEN 'to_status'   THEN to_status
            WHEN 'vendor'      THEN vendor
            WHEN 'changed_by'  THEN changed_by
            WHEN 'change_date' THEN change_date::text
            WHEN 'month'       THEN month
            ELSE site
          END AS col_val,
          order_id
        FROM base
      ),
      agg AS (
        SELECT
          row_val,
          col_val,
          CASE v_measure
            WHEN 'orders_touched' THEN COUNT(DISTINCT order_id)::numeric
            ELSE                       COUNT(*)::numeric
          END AS val
        FROM enriched
        GROUP BY row_val, col_val
      )
      SELECT json_build_object(v_row_key, row_val, v_col_key, col_val, v_measure, val)
      FROM agg
      WHERE val IS NOT NULL
      ORDER BY row_val, col_val
      LIMIT 5000
    LOOP RETURN NEXT v_rec; END LOOP;
  END IF;

  RETURN;
END;
$$;

-- 3. Registry ------------------------------------------------------------------
-- Every key listed here is handled by a CASE branch (dimensions) or a CASE
-- branch of v_measure (measures) in the matching function above.
INSERT INTO public.reportable_datasets
  (key, label, description, source, dimensions, measures, supports_matrix, is_active)
VALUES
  (
    'activities',
    'Activities',
    'Activities raised by the team — type, site, status and hours.',
    'get_activities_report',
    '[
      {"key":"team_member","label":"Raised by"},
      {"key":"activity_type","label":"Activity type"},
      {"key":"status","label":"Status"},
      {"key":"site","label":"Site"},
      {"key":"activity_date","label":"Activity date"},
      {"key":"month","label":"Month"}
    ]'::jsonb,
    '[
      {"key":"activity_count","label":"Activities","agg":"count"},
      {"key":"total_hours","label":"Total hours","agg":"sum"},
      {"key":"completed","label":"Completed","agg":"count"},
      {"key":"in_progress","label":"In progress","agg":"count"},
      {"key":"planned","label":"Planned","agg":"count"}
    ]'::jsonb,
    true,
    true
  ),
  (
    'procurement_status_changes',
    'PO status changes',
    'Every purchase-order status move — from, to, who changed it and when.',
    'get_procurement_status_changes_report',
    '[
      {"key":"to_status","label":"Moved to"},
      {"key":"from_status","label":"Moved from"},
      {"key":"site","label":"Site"},
      {"key":"vendor","label":"Vendor"},
      {"key":"changed_by","label":"Changed by"},
      {"key":"change_date","label":"Change date"},
      {"key":"month","label":"Month"}
    ]'::jsonb,
    '[
      {"key":"change_count","label":"Status changes","agg":"count"},
      {"key":"orders_touched","label":"Orders touched","agg":"count"}
    ]'::jsonb,
    true,
    true
  )
ON CONFLICT (key) DO UPDATE
SET label           = EXCLUDED.label,
    description     = EXCLUDED.description,
    source          = EXCLUDED.source,
    dimensions      = EXCLUDED.dimensions,
    measures        = EXCLUDED.measures,
    supports_matrix = EXCLUDED.supports_matrix,
    is_active       = EXCLUDED.is_active,
    updated_at      = now();

-- 4. Grants --------------------------------------------------------------------
-- generate-report calls these as service_role; the wizard's preview path calls
-- them as the signed-in user. Nothing is granted to anon.
GRANT EXECUTE ON FUNCTION public.get_activities_report(text, text, text, text[], jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_procurement_status_changes_report(text, text, text, text[], jsonb)
  TO authenticated, service_role;
