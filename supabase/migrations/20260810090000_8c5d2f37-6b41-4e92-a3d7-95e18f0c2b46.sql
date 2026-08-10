-- Give the daily check-in and check-out reports their own column sets.
--
-- Both subscriptions call get_attendance_report() with layout 'tabular', and
-- that branch returned one fixed set of columns: Date, Team member, Status,
-- Check-in, Check-out. So the check-in report carried a Check-out column that
-- is always "-" at 11:30, and both carried a Status column that reads "Present"
-- on every row of a report built from attendance rows.
--
-- Wanted instead:
--   check-in  -> Date, Team member, Check-in
--   check-out -> Date, Team member, Check-out, Total hours
--
-- The two reports were indistinguishable inside the function: their
-- report_definitions rows were byte-identical. This adds a discriminator,
-- filters.report_variant, which generate-report already forwards — it merges
-- config.filters into p_filters on every run (callDatasetRpc). Part 2 sets it
-- on the two seeded definitions.
--
-- An attendance report built by hand in the report wizard carries no variant
-- and keeps the full column set, so this does not narrow anything a user
-- assembled themselves.
--
-- Dates move to DD/MM/YYYY across the whole tabular branch. Every other date in
-- the app reads that way, and "07 Aug 2026" was the odd one out.
--
-- Only the 'tabular' branch changes; 'grouped' and 'matrix' are copied through
-- unchanged, as CREATE OR REPLACE demands the whole body.

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
  -- '' for any report that did not ask for one of the two named variants.
  v_variant    text := COALESCE(p_filters->>'report_variant', '');
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

    IF v_variant = 'check_in' THEN
      FOR v_rec IN
        SELECT to_jsonb(t) FROM (
          SELECT
            TO_CHAR(a.date, 'DD/MM/YYYY') AS "Date",
            COALESCE(NULLIF(pr.full_name, ''), NULLIF(pr.username, ''), 'Unknown') AS "Team member",
            COALESCE(TO_CHAR(a.check_in_time AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM'), '-') AS "Check-in"
          FROM public.attendance a
          LEFT JOIN public.profiles pr ON pr.id = a.user_id
          WHERE a.date BETWEEN v_date_from AND v_date_to
            AND (v_user_ids IS NULL OR a.user_id = ANY(v_user_ids))
          ORDER BY a.date DESC, 2 ASC
          LIMIT 5000
        ) t
      LOOP RETURN NEXT v_rec; END LOOP;

    ELSIF v_variant = 'check_out' THEN
      FOR v_rec IN
        SELECT to_jsonb(t) FROM (
          SELECT
            TO_CHAR(a.date, 'DD/MM/YYYY') AS "Date",
            COALESCE(NULLIF(pr.full_name, ''), NULLIF(pr.username, ''), 'Unknown') AS "Team member",
            COALESCE(TO_CHAR(a.check_out_time AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM'), '-') AS "Check-out",
            -- Time on the clock for the day, as "8h 05m".
            --
            -- Derived from the two timestamps rather than read from
            -- attendance.total_hours, because that column is only written when
            -- someone checks out through the app and is 0 or NULL for anyone
            -- still checked in. total_hours is the fallback for rows where the
            -- timestamps cannot produce an answer, and rows with neither show
            -- "-" — which is the useful signal here, since it marks the people
            -- who never checked out.
            CASE
              WHEN a.check_in_time IS NOT NULL
               AND a.check_out_time IS NOT NULL
               AND a.check_out_time > a.check_in_time
              THEN FLOOR(EXTRACT(EPOCH FROM (a.check_out_time - a.check_in_time)) / 3600)::int::text
                   || 'h '
                   || LPAD(((FLOOR(EXTRACT(EPOCH FROM (a.check_out_time - a.check_in_time)) / 60))::int % 60)::text, 2, '0')
                   || 'm'
              -- Rounded to whole minutes first, then split. Splitting the other
              -- way round (floor the hours, scale the remainder) can round the
              -- remainder up to 60 and print "7h 60m".
              WHEN COALESCE(a.total_hours, 0) > 0
              THEN (ROUND(a.total_hours * 60)::int / 60)::text
                   || 'h '
                   || LPAD((ROUND(a.total_hours * 60)::int % 60)::text, 2, '0')
                   || 'm'
              ELSE '-'
            END AS "Total hours"
          FROM public.attendance a
          LEFT JOIN public.profiles pr ON pr.id = a.user_id
          WHERE a.date BETWEEN v_date_from AND v_date_to
            AND (v_user_ids IS NULL OR a.user_id = ANY(v_user_ids))
          ORDER BY a.date DESC, 2 ASC
          LIMIT 5000
        ) t
      LOOP RETURN NEXT v_rec; END LOOP;

    ELSE
      -- Hand-built attendance reports: unchanged column set, new date format.
      FOR v_rec IN
        SELECT to_jsonb(t) FROM (
          SELECT
            TO_CHAR(a.date, 'DD/MM/YYYY') AS "Date",
            COALESCE(NULLIF(pr.full_name, ''), NULLIF(pr.username, ''), 'Unknown') AS "Team member",
            INITCAP(REPLACE(COALESCE(a.status, ''), '_', ' ')) AS "Status",
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
    END IF;

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

-- 2. Tag the two seeded definitions so the function can tell them apart. -------
-- Matched on name, which is how they were seeded in 20260805180000. The
-- jsonb_build_object step guarantees a 'filters' object exists before
-- jsonb_set writes into it, so this is safe on a definition saved without one.
UPDATE public.report_definitions
SET config = jsonb_set(
      COALESCE(config, '{}'::jsonb)
        || jsonb_build_object('filters', COALESCE(config->'filters', '{}'::jsonb)),
      '{filters,report_variant}',
      '"check_in"'::jsonb,
      true
    ),
    updated_at = now()
WHERE name = 'Daily check-in report';

UPDATE public.report_definitions
SET config = jsonb_set(
      COALESCE(config, '{}'::jsonb)
        || jsonb_build_object('filters', COALESCE(config->'filters', '{}'::jsonb)),
      '{filters,report_variant}',
      '"check_out"'::jsonb,
      true
    ),
    updated_at = now()
WHERE name = 'Daily check-out report';
