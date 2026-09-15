-- Rework the daily activity digest's columns, and re-assert the ASCII
-- placeholders on the PO digest.
--
-- 1. ACTIVITY DIGEST — new column set
--
-- As delivered, the digest carried Created, Code, Activity, Type, Raised by,
-- Site, Activity date, Status. Two problems with that in practice:
--
--   * "Activity" (activity_name) and "Type" (activity_type) are near-duplicates.
--     Real rows read "Goods Receipt / Goods Receipt" and "Other / Other"; the
--     only rows where they differ are the generic ones ("Activity Update /
--     General Activity"), which is not worth a whole column.
--   * activity_code is an internal identifier. Nobody reading an end-of-day
--     digest acts on ACT-0107.
--
-- Both are dropped. The freed width goes to the two fields that actually say
-- what happened:
--
--   Comment  <- activity_events.description. Despite the column name this is
--               the comment box on the activity card (Activities.tsx:1346
--               seeds commentDraft from it and the placeholder reads
--               "Add a comment..."). `remarks` is NOT it — that is the
--               goods-receipt-only note in CreativeActivityForm.tsx:1393.
--   Location <- activity_events.location_address, the address rendered under
--               the MapPin icon in the activity card (Activities.tsx:1144),
--               falling back to check_in_address for activities that were
--               checked into rather than geotagged on creation.
--
-- Final order, which is the order asked for: Created, Activity date, Type,
-- Status, Site, Raised by, Comment, Location. Still 8 columns, so the A4
-- portrait layout is unchanged (generate-report caps at PDF_MAX_COLS = 10).
--
-- Only the 'daily_created' branch changes. A report built by hand in the wizard
-- carries no variant, and its column set — which does include the code and the
-- activity name — is copied through untouched, as CREATE OR REPLACE demands the
-- whole body.
--
-- 2. PO DIGEST — placeholders, again
--
-- The 19:00 report of 11/09 printed "?" in Vendor and Note wherever the value
-- was empty, which means the live function still had the em-dash placeholder
-- from the first cut: generate-report's PDF renderer replaces every non-ASCII
-- codepoint with "?" (toAscii, index.ts:692) because the base-14 fonts are
-- WinAnsi-encoded and pdf-lib throws on anything it cannot encode.
--
-- 20260911091000 was corrected in the repo but evidently never re-applied to the
-- database. Re-asserting the whole function here makes the two agree regardless
-- of what is currently installed. Nothing else about it changes.

-- 1. get_activities_report() ---------------------------------------------------
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
      FOR v_rec IN
        SELECT to_json(t) FROM (
          SELECT
            TO_CHAR(a.created_at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM') AS "Created",
            TO_CHAR(a.activity_date, 'DD/MM/YYYY')                          AS "Activity date",
            INITCAP(REPLACE(COALESCE(a.activity_type, ''), '_', ' '))       AS "Type",
            INITCAP(REPLACE(COALESCE(a.status, ''), '_', ' '))              AS "Status",
            COALESCE(ps.site_name, '-')                                     AS "Site",
            COALESCE(NULLIF(pr.full_name, ''), NULLIF(pr.username, ''), 'Unknown') AS "Raised by",
            COALESCE(NULLIF(a.description, ''), '-')                        AS "Comment",
            COALESCE(
              NULLIF(a.location_address, ''),
              NULLIF(a.check_in_address, ''),
              '-'
            )                                                               AS "Location"
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
-- Identical to 20260911091000 as corrected. Re-asserted so the installed
-- function is known to carry ASCII '-' placeholders rather than an em-dash.
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

GRANT EXECUTE ON FUNCTION public.get_activities_report(text, text, text, text[], jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_procurement_status_changes_report(text, text, text, text[], jsonb)
  TO authenticated, service_role;
