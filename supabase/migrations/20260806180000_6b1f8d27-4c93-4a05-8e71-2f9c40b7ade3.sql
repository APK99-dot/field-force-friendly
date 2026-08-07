-- Attendance report: drop Site and Hours, and show times people can read.
--
-- The tabular branch emitted raw UTC timestamps (2026-08-06T03:44:27.047+00:00)
-- plus a Site column that reads "Unassigned" for most of the team and an Hours
-- column that is 0 until someone checks out. Neither earns its place in a
-- check-in report.
--
-- Columns are now Date, Team member, Status, Check-in, Check-out, with times
-- converted from UTC to Asia/Kolkata and formatted as "09:14 AM". Column
-- headings are the quoted aliases, because generate-report derives the PDF and
-- CSV header row from the returned JSON keys.
--
-- Only the 'tabular' branch changes. 'grouped' and 'matrix' are untouched, as
-- are the other three report functions.

CREATE OR REPLACE FUNCTION public.get_attendance_report(
  p_layout text,
  p_rows text,
  p_columns text,
  p_values text[],
  p_filters jsonb
)
RETURNS SETOF jsonb
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
  v_measure    text := COALESCE(p_values[1], 'days_present');
  v_row_key    text := COALESCE(NULLIF(p_rows, ''), 'team_member');
  v_col_key    text := COALESCE(NULLIF(p_columns, ''), 'date');
  v_rec        jsonb;
BEGIN
  IF v_date_from > v_date_to THEN
    v_date_from := v_date_to;
  END IF;
  IF v_date_from < v_date_to - 366 THEN
    v_date_from := v_date_to - 366;
  END IF;

  v_user_ids := public.report_scope_user_ids(v_scope_user);

  IF p_layout = 'tabular' THEN
    FOR v_rec IN
      SELECT to_jsonb(t) FROM (
        SELECT
          TO_CHAR(a.date, 'DD Mon YYYY') AS "Date",
          COALESCE(NULLIF(pr.full_name, ''), NULLIF(pr.username, ''), 'Unknown') AS "Team member",
          INITCAP(REPLACE(COALESCE(a.status, ''), '_', ' ')) AS "Status",
          -- Times are stored in UTC. Render them in the reporting timezone and in
          -- a form a person reads at a glance: "09:14 AM", not an ISO timestamp.
          COALESCE(TO_CHAR(a.check_in_time AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM'), '-') AS "Check-in",
          COALESCE(TO_CHAR(a.check_out_time AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM'), '-') AS "Check-out"
        FROM public.attendance a
        LEFT JOIN public.profiles pr ON pr.id = a.user_id
        WHERE a.date BETWEEN v_date_from AND v_date_to
          AND (v_user_ids IS NULL OR a.user_id = ANY(v_user_ids))
        ORDER BY a.date DESC, 2 ASC
        LIMIT 5000
      ) t
    LOOP RETURN NEXT v_rec; END LOOP;

  ELSIF p_layout = 'grouped' THEN
    FOR v_rec IN
      WITH days AS (
        SELECT generate_series(v_date_from, v_date_to, '1 day'::interval)::date AS d
      ),
      roster AS (
        SELECT
          pr.id AS user_id,
          COALESCE(NULLIF(pr.full_name, ''), NULLIF(pr.username, ''), 'Unknown') AS team_member,
          COALESCE((
            SELECT ps.site_name
            FROM public.site_assignments sa
            JOIN public.project_sites ps ON ps.id = sa.site_id
            WHERE sa.user_id = pr.id
            ORDER BY sa.assigned_at DESC
            LIMIT 1
          ), 'Unassigned') AS site
        FROM public.profiles pr
        WHERE COALESCE(pr.user_status, 'active') = 'active'
          AND (v_user_ids IS NULL OR pr.id = ANY(v_user_ids))
      ),
      base AS (
        SELECT
          d.d AS date,
          r.team_member,
          r.site,
          COALESCE(a.status, 'absent') AS status,
          COALESCE(a.total_hours, 0)::numeric AS total_hours
        FROM days d
        CROSS JOIN roster r
        LEFT JOIN public.attendance a
               ON a.user_id = r.user_id AND a.date = d.d
      )
      SELECT to_jsonb(t) FROM (
        SELECT
          CASE v_row_key
            WHEN 'date'   THEN date::text
            WHEN 'status' THEN status
            WHEN 'site'   THEN site
            ELSE team_member
          END AS grp,
          COALESCE(AVG(total_hours), 0)::numeric(10,2)   AS hours,
          COALESCE(SUM(total_hours), 0)::numeric(12,2)   AS total_hours,
          COUNT(*) FILTER (WHERE status = 'present')::bigint        AS days_present,
          COUNT(*) FILTER (WHERE status = 'absent')::bigint         AS days_absent,
          COUNT(*) FILTER (WHERE status = 'half_day_leave')::bigint AS half_days,
          COUNT(*) FILTER (WHERE status = 'leave')::bigint          AS days_leave
        FROM base
        GROUP BY 1
        ORDER BY 1 ASC
        LIMIT 2000
      ) t
    LOOP RETURN NEXT v_rec; END LOOP;

  ELSIF p_layout = 'matrix' THEN
    FOR v_rec IN
      WITH days AS (
        SELECT generate_series(v_date_from, v_date_to, '1 day'::interval)::date AS d
      ),
      roster AS (
        SELECT
          pr.id AS user_id,
          COALESCE(NULLIF(pr.full_name, ''), NULLIF(pr.username, ''), 'Unknown') AS team_member,
          COALESCE((
            SELECT ps.site_name
            FROM public.site_assignments sa
            JOIN public.project_sites ps ON ps.id = sa.site_id
            WHERE sa.user_id = pr.id
            ORDER BY sa.assigned_at DESC
            LIMIT 1
          ), 'Unassigned') AS site
        FROM public.profiles pr
        WHERE COALESCE(pr.user_status, 'active') = 'active'
          AND (v_user_ids IS NULL OR pr.id = ANY(v_user_ids))
      ),
      base AS (
        SELECT
          d.d AS date,
          r.team_member,
          r.site,
          COALESCE(a.status, 'absent') AS status,
          COALESCE(a.total_hours, 0)::numeric AS total_hours
        FROM days d
        CROSS JOIN roster r
        LEFT JOIN public.attendance a
               ON a.user_id = r.user_id AND a.date = d.d
      ),
      enriched AS (
        SELECT
          CASE v_row_key
            WHEN 'date'   THEN date::text
            WHEN 'status' THEN status
            WHEN 'site'   THEN site
            ELSE team_member
          END AS row_val,
          CASE v_col_key
            WHEN 'date'   THEN date::text
            WHEN 'status' THEN status
            WHEN 'site'   THEN site
            ELSE team_member
          END AS col_val,
          status,
          total_hours
        FROM base
      ),
      agg AS (
        SELECT
          row_val,
          col_val,
          CASE v_measure
            WHEN 'hours'      THEN COALESCE(AVG(total_hours), 0)::numeric(10,2)
            WHEN 'days_absent' THEN COUNT(*) FILTER (WHERE status = 'absent')::numeric
            WHEN 'half_days'  THEN COUNT(*) FILTER (WHERE status = 'half_day_leave')::numeric
            WHEN 'days_leave' THEN COUNT(*) FILTER (WHERE status = 'leave')::numeric
            ELSE                   COUNT(*) FILTER (WHERE status = 'present')::numeric
          END AS val
        FROM enriched
        GROUP BY row_val, col_val
      )
      SELECT jsonb_build_object(v_row_key, row_val, v_col_key, col_val, v_measure, val)
      FROM agg
      WHERE val IS NOT NULL
      ORDER BY row_val, col_val
      LIMIT 5000
    LOOP RETURN NEXT v_rec; END LOOP;
  END IF;

  RETURN;
END;
$$;
