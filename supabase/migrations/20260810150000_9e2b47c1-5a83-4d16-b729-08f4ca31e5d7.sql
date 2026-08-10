-- List people on approved leave in the daily attendance reports.
--
-- The reports only ever showed attendance rows, so anyone on leave was simply
-- absent from the file -- indistinguishable from someone who forgot to check
-- in. Approved leave now appears beneath the check-ins, carrying the leave
-- type, the half-day period where there is one, and the reason the person
-- entered.
--
-- Leave is a separate source rather than a join: somebody on leave usually has
-- no attendance row at all, so there is nothing to join to. Where both exist,
-- the leave row wins and the person is listed once -- attendance would only
-- repeat them without the reason.
--
-- New column "Remarks" carries type and reason. The Check-in / Check-out cell
-- reads "On leave" or "Half day" for those rows, which keeps the column count
-- down and the block obvious at a glance.
--
-- Only APPROVED leave is included. Pending applications are not commitments
-- yet, and showing them would misreport who is expected on site.
--
-- DROP + CREATE rather than CREATE OR REPLACE so this applies whether or not
-- 20260810120000 (jsonb -> json) has been run. The GRANT is restored at the end.

DROP FUNCTION IF EXISTS public.get_attendance_report(text, text, text, text[], jsonb);

CREATE FUNCTION public.get_attendance_report(
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
  v_measure    text := COALESCE(p_values[1], 'days_present');
  v_row_key    text := COALESCE(NULLIF(p_rows, ''), 'team_member');
  v_col_key    text := COALESCE(NULLIF(p_columns, ''), 'date');
  -- '' for any report that did not ask for one of the two named variants.
  v_variant    text := COALESCE(p_filters->>'report_variant', '');
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

    IF v_variant = 'check_in' THEN
      FOR v_rec IN
      WITH lv AS (
        -- Approved leave, expanded to one row per day inside the window.
        -- Someone on leave usually has no attendance row at all, so this is a
        -- separate source rather than a join.
        SELECT
          g.d::date AS d,
          l.user_id,
          COALESCE(NULLIF(pr.full_name, ''), NULLIF(pr.username, ''), 'Unknown') AS member,
          COALESCE(l.is_half_day, false) AS is_half_day,
          COALESCE(NULLIF(lt.name, ''), 'Leave')
            || CASE
                 WHEN COALESCE(l.is_half_day, false) AND NULLIF(l.half_day_period, '') IS NOT NULL
                 THEN ' (' || INITCAP(REPLACE(l.half_day_period, '_', ' ')) || ')'
                 ELSE ''
               END
            || COALESCE(' — ' || NULLIF(TRIM(COALESCE(l.reason, '')), ''), '') AS remarks
        FROM public.leave_applications l
        LEFT JOIN public.profiles pr ON pr.id = l.user_id
        LEFT JOIN public.leave_types lt ON lt.id = l.leave_type_id
        CROSS JOIN LATERAL generate_series(
          GREATEST(l.from_date, v_date_from)::timestamp,
          LEAST(l.to_date, v_date_to)::timestamp,
          '1 day'::interval
        ) AS g(d)
        WHERE LOWER(COALESCE(l.status, '')) = 'approved'
          AND l.from_date <= v_date_to
          AND l.to_date   >= v_date_from
          AND (v_user_ids IS NULL OR l.user_id = ANY(v_user_ids))
      )
        SELECT to_json(t) FROM (
          SELECT u."Date", u."Team member", u."Check-in", u."Remarks"
          FROM (
            SELECT
              0 AS sort_key,
              a.date AS d,
              TO_CHAR(a.date, 'DD/MM/YYYY') AS "Date",
              COALESCE(NULLIF(pr.full_name, ''), NULLIF(pr.username, ''), 'Unknown') AS "Team member",
              COALESCE(TO_CHAR(a.check_in_time AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM'), '-') AS "Check-in",
              '' AS "Remarks"
            FROM public.attendance a
            LEFT JOIN public.profiles pr ON pr.id = a.user_id
            WHERE a.date BETWEEN v_date_from AND v_date_to
              AND (v_user_ids IS NULL OR a.user_id = ANY(v_user_ids))
              -- An approved leave wins over whatever attendance says, so the
              -- person is listed once, in the leave block, with their reason.
              AND NOT EXISTS (
                SELECT 1 FROM lv WHERE lv.user_id = a.user_id AND lv.d = a.date
              )
            UNION ALL
            SELECT
              1 AS sort_key,
              lv.d,
              TO_CHAR(lv.d, 'DD/MM/YYYY'),
              lv.member,
              CASE WHEN lv.is_half_day THEN 'Half day' ELSE 'On leave' END,
              lv.remarks
            FROM lv
          ) u
          -- sort_key puts everyone who was in below everyone who checked in.
          ORDER BY u.d DESC, u.sort_key ASC, u."Team member" ASC
          LIMIT 5000
        ) t
      LOOP RETURN NEXT v_rec; END LOOP;

    ELSIF v_variant = 'check_out' THEN
      FOR v_rec IN
      WITH lv AS (
        -- Approved leave, expanded to one row per day inside the window.
        -- Someone on leave usually has no attendance row at all, so this is a
        -- separate source rather than a join.
        SELECT
          g.d::date AS d,
          l.user_id,
          COALESCE(NULLIF(pr.full_name, ''), NULLIF(pr.username, ''), 'Unknown') AS member,
          COALESCE(l.is_half_day, false) AS is_half_day,
          COALESCE(NULLIF(lt.name, ''), 'Leave')
            || CASE
                 WHEN COALESCE(l.is_half_day, false) AND NULLIF(l.half_day_period, '') IS NOT NULL
                 THEN ' (' || INITCAP(REPLACE(l.half_day_period, '_', ' ')) || ')'
                 ELSE ''
               END
            || COALESCE(' — ' || NULLIF(TRIM(COALESCE(l.reason, '')), ''), '') AS remarks
        FROM public.leave_applications l
        LEFT JOIN public.profiles pr ON pr.id = l.user_id
        LEFT JOIN public.leave_types lt ON lt.id = l.leave_type_id
        CROSS JOIN LATERAL generate_series(
          GREATEST(l.from_date, v_date_from)::timestamp,
          LEAST(l.to_date, v_date_to)::timestamp,
          '1 day'::interval
        ) AS g(d)
        WHERE LOWER(COALESCE(l.status, '')) = 'approved'
          AND l.from_date <= v_date_to
          AND l.to_date   >= v_date_from
          AND (v_user_ids IS NULL OR l.user_id = ANY(v_user_ids))
      )
        SELECT to_json(t) FROM (
          SELECT u."Date", u."Team member", u."Check-out", u."Total hours", u."Remarks"
          FROM (
            SELECT
              0 AS sort_key,
              a.date AS d,
              TO_CHAR(a.date, 'DD/MM/YYYY') AS "Date",
              COALESCE(NULLIF(pr.full_name, ''), NULLIF(pr.username, ''), 'Unknown') AS "Team member",
              COALESCE(TO_CHAR(a.check_out_time AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM'), '-') AS "Check-out",
              -- Time on the clock, as "8h 05m". Derived from the two timestamps
              -- rather than attendance.total_hours, which is only written on
              -- check-out and reads 0 for anyone still on site. total_hours is
              -- the fallback; rows with neither show "-", which is the useful
              -- signal here since it marks whoever never checked out.
              CASE
                WHEN a.check_in_time IS NOT NULL
                 AND a.check_out_time IS NOT NULL
                 AND a.check_out_time > a.check_in_time
                THEN FLOOR(EXTRACT(EPOCH FROM (a.check_out_time - a.check_in_time)) / 3600)::int::text
                     || 'h '
                     || LPAD(((FLOOR(EXTRACT(EPOCH FROM (a.check_out_time - a.check_in_time)) / 60))::int % 60)::text, 2, '0')
                     || 'm'
                -- Rounded to whole minutes first, then split. Splitting the
                -- other way round can round the remainder up and print "7h 60m".
                WHEN COALESCE(a.total_hours, 0) > 0
                THEN (ROUND(a.total_hours * 60)::int / 60)::text
                     || 'h '
                     || LPAD((ROUND(a.total_hours * 60)::int % 60)::text, 2, '0')
                     || 'm'
                ELSE '-'
              END AS "Total hours",
              '' AS "Remarks"
            FROM public.attendance a
            LEFT JOIN public.profiles pr ON pr.id = a.user_id
            WHERE a.date BETWEEN v_date_from AND v_date_to
              AND (v_user_ids IS NULL OR a.user_id = ANY(v_user_ids))
              AND NOT EXISTS (
                SELECT 1 FROM lv WHERE lv.user_id = a.user_id AND lv.d = a.date
              )
            UNION ALL
            SELECT
              1 AS sort_key,
              lv.d,
              TO_CHAR(lv.d, 'DD/MM/YYYY'),
              lv.member,
              CASE WHEN lv.is_half_day THEN 'Half day' ELSE 'On leave' END,
              '-',
              lv.remarks
            FROM lv
          ) u
          ORDER BY u.d DESC, u.sort_key ASC, u."Team member" ASC
          LIMIT 5000
        ) t
      LOOP RETURN NEXT v_rec; END LOOP;

    ELSE
      -- Hand-built attendance reports: unchanged column set.
      FOR v_rec IN
        SELECT to_json(t) FROM (
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
      SELECT to_json(t) FROM (
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

GRANT EXECUTE ON FUNCTION public.get_attendance_report(text, text, text, text[], jsonb)
  TO authenticated, service_role;
