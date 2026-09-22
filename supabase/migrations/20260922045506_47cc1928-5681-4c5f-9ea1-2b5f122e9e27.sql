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
          hours,
          raw_status
        FROM base
      ),
      agg AS (
        SELECT
          row_val,
          col_val,
          CASE v_measure
            WHEN 'total_hours' THEN COALESCE(SUM(hours), 0)::numeric(16,2)
            WHEN 'completed'   THEN COUNT(*) FILTER (WHERE raw_status = 'completed')::numeric
            WHEN 'in_progress' THEN COUNT(*) FILTER (WHERE raw_status = 'in_progress')::numeric
            WHEN 'planned'     THEN COUNT(*) FILTER (WHERE raw_status = 'planned')::numeric
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