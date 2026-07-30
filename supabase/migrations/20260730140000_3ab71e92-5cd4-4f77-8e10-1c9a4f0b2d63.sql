-- Report Subscriptions — phase 2: the four Bharath Builders datasets.
--
-- Phase 1 (20260730120000) shipped the registry and the subscription/delivery
-- tables with reportable_datasets deliberately EMPTY, so the builder rendered a
-- "no datasets yet" state. This migration fills it: four get_*_report RPCs plus
-- the four registry rows that point at them.
--
-- FUNCTION CONTRACT — fixed by the generate-report edge function that phase 3
-- will port (supabase/functions/generate-report/index.ts, callRpc()). Every
-- dataset function MUST be:
--
--   public.get_<x>_report(
--     p_layout   text,        -- report_definitions.layout: tabular|grouped|matrix
--     p_rows     text,        -- config.rows[0]   (may be NULL)
--     p_columns  text,        -- config.columns[0](may be NULL)
--     p_values   text[],      -- config.values[] mapped to their keys (may be '{}')
--     p_filters  jsonb        -- config.filters merged with the run's
--                             -- { date_from, date_to [, scope_user_id] }
--   ) RETURNS SETOF jsonb
--
-- The edge function calls it by NAME, taken from reportable_datasets.source, with
-- exactly those five named parameters, and treats each returned jsonb as one flat
-- record: Object.keys(rows[0]) becomes the Excel header row and the PDF columns.
-- So every emitted object must be flat and every row in a result set must carry
-- the same keys. scope_user_id is present only when the subscription's scope is
-- 'per_recipient' (and it is always present for recipient_mode='all_managers',
-- which forces per_recipient) — it is the RECIPIENT's user id, not the author's.
--
-- ROW-LEVEL VISIBILITY. These functions are SECURITY DEFINER, so they bypass RLS
-- exactly like the source's do. The source scoped on p_filters->>'scope_user_id'
-- by expanding it to self + subordinates via get_all_subordinates(). The
-- equivalent here is public.get_subordinate_users(uuid) (recursive over
-- employees.manager_id, added in 20260224130522). Two helpers below implement it:
--
--   report_scope_user_ids(uuid)  -> self + subordinates, NULL for an admin
--   report_scope_site_ids(uuid)  -> the project_sites those users are assigned
--                                   to (site_assignments), NULL for an admin
--
--   * NULL means "no restriction". Both helpers return NULL when the scope user
--     is NULL (a 'shared' run — the admin-authored report, same as the source) or
--     when the scope user holds the admin role, who can already read all of these
--     tables through RLS.
--   * An empty uuid[] means "restrict to nothing": `x = ANY('{}')` is false for
--     every x, so a non-admin with no subordinates and no site assignments gets
--     an empty report rather than the whole company's. Rows with a NULL site_id
--     are likewise invisible to a site-scoped recipient (NULL = ANY(...) is NULL).
--
-- ADDITIVE ONLY. Six brand-new functions and four INSERT ... ON CONFLICT DO
-- NOTHING rows into the empty registry. No ALTER, no DROP, no trigger on any
-- pre-existing object. Safe against a live production database.
--
-- Every column referenced below was verified against both the CREATE TABLE /
-- ALTER TABLE ... ADD COLUMN statements in this directory and the table's entry
-- in src/integrations/supabase/types.ts. Notably: procurement_items links to its
-- purchase order through `procurement_id`, NOT `po_id` (procurement_grns and
-- procurement_invoices are the ones with `po_id`).

-- 1. report_scope_user_ids() ---------------------------------------------------
-- Self + everyone underneath them in the employees.manager_id tree. NULL for an
-- admin or for a NULL input, meaning "unrestricted". get_subordinate_users() is
-- wrapped in an exception block for the same reason the source wrapped
-- get_all_subordinates(): a cycle or a missing employees row must degrade to
-- "just me", never abort the whole report run.
CREATE OR REPLACE FUNCTION public.report_scope_user_ids(p_user_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF public.has_role(p_user_id, 'admin'::app_role) THEN
    RETURN NULL;
  END IF;

  BEGIN
    SELECT ARRAY(
      SELECT s.user_id
      FROM public.get_subordinate_users(p_user_id) s
      WHERE s.user_id IS NOT NULL
    ) INTO v_ids;
  EXCEPTION WHEN OTHERS THEN
    v_ids := '{}'::uuid[];
  END;

  RETURN COALESCE(v_ids, '{}'::uuid[]) || p_user_id;
END;
$$;

-- 2. report_scope_site_ids() ---------------------------------------------------
-- The site-side equivalent: which project_sites may this recipient see. Rows in
-- the procurement and milestone datasets carry no user_id, so hierarchy alone
-- cannot scope them; site_assignments is this app's user -> site edge.
CREATE OR REPLACE FUNCTION public.report_scope_site_ids(p_user_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_users uuid[];
  v_sites uuid[];
BEGIN
  v_users := public.report_scope_user_ids(p_user_id);

  -- NULL = admin or shared run = unrestricted.
  IF v_users IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT sa.site_id), '{}'::uuid[])
    INTO v_sites
  FROM public.site_assignments sa
  WHERE sa.user_id = ANY(v_users);

  RETURN COALESCE(v_sites, '{}'::uuid[]);
END;
$$;

-- 3. get_attendance_report() ---------------------------------------------------
-- Daily attendance per team member. Modelled on the source's get_attendance_report
-- and adapted to this database:
--
--   * profiles here has user_status (not is_active) and no beat concept, so the
--     roster filter is COALESCE(user_status,'active') = 'active' and the source's
--     `beat` dimension is replaced by `site`.
--   * public.attendance has NO site column (verified: CREATE TABLE in
--     20260224130522 plus the single ADD COLUMN batch in 20260225073611). Site is
--     therefore derived from site_assignments — a person can hold several, so the
--     most recent assignment wins, one label per person, which keeps the
--     aggregates from fanning out.
--   * Statuses in this app are present / absent / leave / half_day_leave /
--     holiday, same vocabulary the source used.
--
-- The grouped and matrix branches cross-join a roster against the day series so
-- that a person with no attendance row still counts as absent. The window is
-- clamped to 366 days so a mis-entered date range cannot generate an unbounded
-- series (the dispatcher only ever asks for a day, week or month).
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
          a.date,
          COALESCE(NULLIF(pr.full_name, ''), NULLIF(pr.username, ''), 'Unknown') AS team_member,
          a.status,
          COALESCE((
            SELECT ps.site_name
            FROM public.site_assignments sa
            JOIN public.project_sites ps ON ps.id = sa.site_id
            WHERE sa.user_id = a.user_id
            ORDER BY sa.assigned_at DESC
            LIMIT 1
          ), 'Unassigned') AS site,
          a.check_in_time,
          a.check_out_time,
          COALESCE(a.total_hours, 0)::numeric(10,2) AS hours
        FROM public.attendance a
        LEFT JOIN public.profiles pr ON pr.id = a.user_id
        WHERE a.date BETWEEN v_date_from AND v_date_to
          AND (v_user_ids IS NULL OR a.user_id = ANY(v_user_ids))
        ORDER BY a.date DESC, team_member ASC
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

-- 4. get_procurement_orders_report() -------------------------------------------
-- Purchase orders by status / vendor / site / period.
--
-- Columns verified: procurement_orders(order_date, po_number, status, grn_status,
-- total_amount, expected_delivery_date, vendor_id, site_id) from CREATE TABLE in
-- 20260618125211 plus ADD COLUMN in 20260619063753; vendors(name) and
-- project_sites(site_name) from their CREATE TABLEs.
--
-- Scoped by site: a non-admin recipient sees only orders on the sites they (or
-- their reports) are assigned to. Orders with a NULL site_id are visible only on
-- an unscoped (shared / admin) run.
CREATE OR REPLACE FUNCTION public.get_procurement_orders_report(
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
  v_site_ids   uuid[];
  v_measure    text := COALESCE(p_values[1], 'order_count');
  v_row_key    text := COALESCE(NULLIF(p_rows, ''), 'site');
  v_col_key    text := COALESCE(NULLIF(p_columns, ''), 'status');
  v_rec        jsonb;
BEGIN
  IF v_date_from > v_date_to THEN
    v_date_from := v_date_to;
  END IF;

  v_site_ids := public.report_scope_site_ids(v_scope_user);

  IF p_layout = 'tabular' THEN
    FOR v_rec IN
      SELECT to_jsonb(t) FROM (
        SELECT
          o.order_date,
          COALESCE(o.po_number, '—') AS po_number,
          COALESCE(o.status, 'Unknown') AS status,
          COALESCE(v.name, 'Unassigned') AS vendor,
          COALESCE(ps.site_name, 'Unassigned') AS site,
          o.expected_delivery_date,
          COALESCE(o.grn_status, '—') AS grn_status,
          1 AS order_count,
          COALESCE(o.total_amount, 0)::numeric(14,2) AS total_value
        FROM public.procurement_orders o
        LEFT JOIN public.vendors v ON v.id = o.vendor_id
        LEFT JOIN public.project_sites ps ON ps.id = o.site_id
        WHERE o.order_date BETWEEN v_date_from AND v_date_to
          AND (v_site_ids IS NULL OR o.site_id = ANY(v_site_ids))
        ORDER BY o.order_date DESC, po_number ASC
        LIMIT 5000
      ) t
    LOOP RETURN NEXT v_rec; END LOOP;

  ELSIF p_layout = 'grouped' THEN
    FOR v_rec IN
      WITH base AS (
        SELECT
          o.order_date,
          to_char(o.order_date, 'YYYY-MM') AS month,
          COALESCE(o.status, 'Unknown') AS status,
          COALESCE(v.name, 'Unassigned') AS vendor,
          COALESCE(ps.site_name, 'Unassigned') AS site,
          COALESCE(o.total_amount, 0)::numeric AS total_value
        FROM public.procurement_orders o
        LEFT JOIN public.vendors v ON v.id = o.vendor_id
        LEFT JOIN public.project_sites ps ON ps.id = o.site_id
        WHERE o.order_date BETWEEN v_date_from AND v_date_to
          AND (v_site_ids IS NULL OR o.site_id = ANY(v_site_ids))
      )
      SELECT to_jsonb(t) FROM (
        SELECT
          CASE v_row_key
            WHEN 'status'     THEN status
            WHEN 'vendor'     THEN vendor
            WHEN 'order_date' THEN order_date::text
            WHEN 'month'      THEN month
            ELSE site
          END AS grp,
          COUNT(*)::bigint AS order_count,
          COALESCE(SUM(total_value), 0)::numeric(16,2) AS total_value,
          COALESCE(AVG(total_value), 0)::numeric(16,2) AS avg_order_value
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
          o.order_date,
          to_char(o.order_date, 'YYYY-MM') AS month,
          COALESCE(o.status, 'Unknown') AS status,
          COALESCE(v.name, 'Unassigned') AS vendor,
          COALESCE(ps.site_name, 'Unassigned') AS site,
          COALESCE(o.total_amount, 0)::numeric AS total_value
        FROM public.procurement_orders o
        LEFT JOIN public.vendors v ON v.id = o.vendor_id
        LEFT JOIN public.project_sites ps ON ps.id = o.site_id
        WHERE o.order_date BETWEEN v_date_from AND v_date_to
          AND (v_site_ids IS NULL OR o.site_id = ANY(v_site_ids))
      ),
      enriched AS (
        SELECT
          CASE v_row_key
            WHEN 'status'     THEN status
            WHEN 'vendor'     THEN vendor
            WHEN 'order_date' THEN order_date::text
            WHEN 'month'      THEN month
            ELSE site
          END AS row_val,
          CASE v_col_key
            WHEN 'status'     THEN status
            WHEN 'vendor'     THEN vendor
            WHEN 'order_date' THEN order_date::text
            WHEN 'month'      THEN month
            ELSE site
          END AS col_val,
          total_value
        FROM base
      ),
      agg AS (
        SELECT
          row_val,
          col_val,
          CASE v_measure
            WHEN 'total_value' THEN COALESCE(SUM(total_value), 0)::numeric(16,2)
            ELSE                    COUNT(*)::numeric
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

-- 5. get_grn_report() ----------------------------------------------------------
-- Goods receipts per site / period, received quantity against ordered quantity.
--
-- Join path, every leg verified:
--   procurement_grns.id          <- procurement_grn_items.grn_id
--   procurement_grn_items.procurement_item_id -> procurement_items.id
--   procurement_items.procurement_id          -> procurement_orders.id
--        ^ THIS COLUMN IS `procurement_id`, NOT `po_id`. procurement_grns and
--          procurement_invoices are the tables whose PO FK is called `po_id`.
--   procurement_grns.po_id       -> procurement_orders.id  (used for the site,
--          because it is NOT NULL, whereas procurement_item_id is nullable)
--   procurement_orders.site_id   -> project_sites.id
--
-- procurement_grn_items.product_id has no declared foreign key (CREATE TABLE in
-- 20260619063753 declares it as a bare uuid, and types.ts lists no relationship
-- for it), so the master_products lookup is a LEFT JOIN on
-- COALESCE(gi.product_id, pi.product_id): if the id is not a master_products row
-- the label simply falls back to 'Unknown item' rather than dropping the receipt.
--
-- ordered_qty prefers the GRN line's own snapshot and falls back to the PO line's
-- qty when the snapshot is zero, which is what makes the ordered-vs-received
-- variance meaningful for receipts booked without a copied quantity.
CREATE OR REPLACE FUNCTION public.get_grn_report(
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
  v_site_ids   uuid[];
  v_measure    text := COALESCE(p_values[1], 'received_qty');
  v_row_key    text := COALESCE(NULLIF(p_rows, ''), 'site');
  v_col_key    text := COALESCE(NULLIF(p_columns, ''), 'month');
  v_rec        jsonb;
BEGIN
  IF v_date_from > v_date_to THEN
    v_date_from := v_date_to;
  END IF;

  v_site_ids := public.report_scope_site_ids(v_scope_user);

  IF p_layout = 'tabular' THEN
    FOR v_rec IN
      SELECT to_jsonb(t) FROM (
        SELECT
          g.receipt_date,
          COALESCE(g.grn_number, '—') AS grn_number,
          COALESCE(o.po_number, '—') AS po_number,
          COALESCE(ps.site_name, 'Unassigned') AS site,
          COALESCE(vn.name, 'Unassigned') AS vendor,
          COALESCE(mp.product_name, 'Unknown item') AS product,
          COALESCE(pi.uom, '—') AS uom,
          COALESCE(g.status, 'Unknown') AS status,
          COALESCE(NULLIF(gi.ordered_qty, 0), pi.qty, 0)::numeric(14,3) AS ordered_qty,
          COALESCE(gi.received_qty, 0)::numeric(14,3) AS received_qty,
          (COALESCE(gi.received_qty, 0)
             - COALESCE(NULLIF(gi.ordered_qty, 0), pi.qty, 0))::numeric(14,3) AS variance_qty
        FROM public.procurement_grns g
        JOIN public.procurement_grn_items gi ON gi.grn_id = g.id
        LEFT JOIN public.procurement_items pi ON pi.id = gi.procurement_item_id
        LEFT JOIN public.procurement_orders o ON o.id = g.po_id
        LEFT JOIN public.project_sites ps ON ps.id = o.site_id
        LEFT JOIN public.vendors vn ON vn.id = COALESCE(g.vendor_id, o.vendor_id)
        LEFT JOIN public.master_products mp ON mp.id = COALESCE(gi.product_id, pi.product_id)
        WHERE g.receipt_date BETWEEN v_date_from AND v_date_to
          AND (v_site_ids IS NULL OR o.site_id = ANY(v_site_ids))
        ORDER BY g.receipt_date DESC, grn_number ASC, product ASC
        LIMIT 5000
      ) t
    LOOP RETURN NEXT v_rec; END LOOP;

  ELSIF p_layout = 'grouped' THEN
    FOR v_rec IN
      WITH base AS (
        SELECT
          g.id AS grn_id,
          g.receipt_date,
          to_char(g.receipt_date, 'YYYY-MM') AS month,
          COALESCE(g.status, 'Unknown') AS status,
          COALESCE(ps.site_name, 'Unassigned') AS site,
          COALESCE(vn.name, 'Unassigned') AS vendor,
          COALESCE(mp.product_name, 'Unknown item') AS product,
          COALESCE(NULLIF(gi.ordered_qty, 0), pi.qty, 0)::numeric AS ordered_qty,
          COALESCE(gi.received_qty, 0)::numeric AS received_qty
        FROM public.procurement_grns g
        JOIN public.procurement_grn_items gi ON gi.grn_id = g.id
        LEFT JOIN public.procurement_items pi ON pi.id = gi.procurement_item_id
        LEFT JOIN public.procurement_orders o ON o.id = g.po_id
        LEFT JOIN public.project_sites ps ON ps.id = o.site_id
        LEFT JOIN public.vendors vn ON vn.id = COALESCE(g.vendor_id, o.vendor_id)
        LEFT JOIN public.master_products mp ON mp.id = COALESCE(gi.product_id, pi.product_id)
        WHERE g.receipt_date BETWEEN v_date_from AND v_date_to
          AND (v_site_ids IS NULL OR o.site_id = ANY(v_site_ids))
      )
      SELECT to_jsonb(t) FROM (
        SELECT
          CASE v_row_key
            WHEN 'status'       THEN status
            WHEN 'vendor'       THEN vendor
            WHEN 'product'      THEN product
            WHEN 'receipt_date' THEN receipt_date::text
            WHEN 'month'        THEN month
            ELSE site
          END AS grp,
          COUNT(DISTINCT grn_id)::bigint AS grn_count,
          COALESCE(SUM(ordered_qty), 0)::numeric(16,3) AS ordered_qty,
          COALESCE(SUM(received_qty), 0)::numeric(16,3) AS received_qty,
          (COALESCE(SUM(received_qty), 0) - COALESCE(SUM(ordered_qty), 0))::numeric(16,3) AS variance_qty
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
          g.id AS grn_id,
          g.receipt_date,
          to_char(g.receipt_date, 'YYYY-MM') AS month,
          COALESCE(g.status, 'Unknown') AS status,
          COALESCE(ps.site_name, 'Unassigned') AS site,
          COALESCE(vn.name, 'Unassigned') AS vendor,
          COALESCE(mp.product_name, 'Unknown item') AS product,
          COALESCE(NULLIF(gi.ordered_qty, 0), pi.qty, 0)::numeric AS ordered_qty,
          COALESCE(gi.received_qty, 0)::numeric AS received_qty
        FROM public.procurement_grns g
        JOIN public.procurement_grn_items gi ON gi.grn_id = g.id
        LEFT JOIN public.procurement_items pi ON pi.id = gi.procurement_item_id
        LEFT JOIN public.procurement_orders o ON o.id = g.po_id
        LEFT JOIN public.project_sites ps ON ps.id = o.site_id
        LEFT JOIN public.vendors vn ON vn.id = COALESCE(g.vendor_id, o.vendor_id)
        LEFT JOIN public.master_products mp ON mp.id = COALESCE(gi.product_id, pi.product_id)
        WHERE g.receipt_date BETWEEN v_date_from AND v_date_to
          AND (v_site_ids IS NULL OR o.site_id = ANY(v_site_ids))
      ),
      enriched AS (
        SELECT
          CASE v_row_key
            WHEN 'status'       THEN status
            WHEN 'vendor'       THEN vendor
            WHEN 'product'      THEN product
            WHEN 'receipt_date' THEN receipt_date::text
            WHEN 'month'        THEN month
            ELSE site
          END AS row_val,
          CASE v_col_key
            WHEN 'status'       THEN status
            WHEN 'vendor'       THEN vendor
            WHEN 'product'      THEN product
            WHEN 'receipt_date' THEN receipt_date::text
            WHEN 'month'        THEN month
            ELSE site
          END AS col_val,
          grn_id,
          ordered_qty,
          received_qty
        FROM base
      ),
      agg AS (
        SELECT
          row_val,
          col_val,
          CASE v_measure
            WHEN 'ordered_qty'  THEN COALESCE(SUM(ordered_qty), 0)::numeric(16,3)
            WHEN 'variance_qty' THEN (COALESCE(SUM(received_qty), 0) - COALESCE(SUM(ordered_qty), 0))::numeric(16,3)
            WHEN 'grn_count'    THEN COUNT(DISTINCT grn_id)::numeric
            ELSE                     COALESCE(SUM(received_qty), 0)::numeric(16,3)
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

-- 6. get_site_milestones_report() ----------------------------------------------
-- Milestone progress per project site over time.
--
-- Columns verified: site_milestones(site_id, name, start_date, end_date, status,
-- priority) from CREATE TABLE in 20260409072735, plus (actual_start_date,
-- actual_end_date, percent_complete, notes, is_active) from 20260616071915 and
-- (at_risk, parent_id) from 20260714084502. Statuses are not_started /
-- in_progress / completed / delayed / on_hold (MILESTONE_STATUSES in
-- src/components/admin/SiteMilestonesDialog.tsx).
--
-- "Over time" means overlap, not containment: a milestone counts for the report
-- period if its own [start_date, end_date] window intersects it, so a long
-- running milestone still appears in every weekly report it spans.
--
-- Soft-deleted sites (project_sites.deleted_at) are excluded — unlike the
-- procurement datasets, where an order stays a real financial record regardless
-- of what happened to the site afterwards.
CREATE OR REPLACE FUNCTION public.get_site_milestones_report(
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
  v_site_ids   uuid[];
  v_measure    text := COALESCE(p_values[1], 'percent_complete');
  v_row_key    text := COALESCE(NULLIF(p_rows, ''), 'site');
  v_col_key    text := COALESCE(NULLIF(p_columns, ''), 'status');
  v_rec        jsonb;
BEGIN
  IF v_date_from > v_date_to THEN
    v_date_from := v_date_to;
  END IF;

  v_site_ids := public.report_scope_site_ids(v_scope_user);

  IF p_layout = 'tabular' THEN
    FOR v_rec IN
      SELECT to_jsonb(t) FROM (
        SELECT
          ps.site_name AS site,
          m.name AS milestone,
          COALESCE(m.status, 'not_started') AS status,
          COALESCE(m.priority, 'medium') AS priority,
          m.start_date,
          m.end_date,
          m.actual_start_date,
          m.actual_end_date,
          COALESCE(m.percent_complete, 0)::numeric(5,0) AS percent_complete,
          m.at_risk,
          (m.end_date < CURRENT_DATE AND COALESCE(m.status, '') <> 'completed') AS is_overdue
        FROM public.site_milestones m
        JOIN public.project_sites ps
          ON ps.id = m.site_id AND ps.deleted_at IS NULL
        WHERE m.is_active
          AND m.start_date <= v_date_to
          AND m.end_date >= v_date_from
          AND (v_site_ids IS NULL OR m.site_id = ANY(v_site_ids))
        ORDER BY site ASC, m.end_date ASC
        LIMIT 5000
      ) t
    LOOP RETURN NEXT v_rec; END LOOP;

  ELSIF p_layout = 'grouped' THEN
    FOR v_rec IN
      WITH base AS (
        SELECT
          ps.site_name AS site,
          COALESCE(m.status, 'not_started') AS status,
          COALESCE(m.priority, 'medium') AS priority,
          to_char(m.end_date, 'YYYY-MM') AS month,
          m.end_date,
          COALESCE(m.percent_complete, 0)::numeric AS percent_complete,
          m.at_risk,
          (m.end_date < CURRENT_DATE AND COALESCE(m.status, '') <> 'completed') AS is_overdue
        FROM public.site_milestones m
        JOIN public.project_sites ps
          ON ps.id = m.site_id AND ps.deleted_at IS NULL
        WHERE m.is_active
          AND m.start_date <= v_date_to
          AND m.end_date >= v_date_from
          AND (v_site_ids IS NULL OR m.site_id = ANY(v_site_ids))
      )
      SELECT to_jsonb(t) FROM (
        SELECT
          CASE v_row_key
            WHEN 'status'   THEN status
            WHEN 'priority' THEN priority
            WHEN 'month'    THEN month
            WHEN 'end_date' THEN end_date::text
            ELSE site
          END AS grp,
          COUNT(*)::bigint AS milestones,
          COALESCE(AVG(percent_complete), 0)::numeric(5,1) AS percent_complete,
          COUNT(*) FILTER (WHERE status = 'completed')::bigint AS completed,
          COUNT(*) FILTER (WHERE at_risk)::bigint AS at_risk,
          COUNT(*) FILTER (WHERE is_overdue)::bigint AS overdue
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
          ps.site_name AS site,
          COALESCE(m.status, 'not_started') AS status,
          COALESCE(m.priority, 'medium') AS priority,
          to_char(m.end_date, 'YYYY-MM') AS month,
          m.end_date,
          COALESCE(m.percent_complete, 0)::numeric AS percent_complete,
          m.at_risk,
          (m.end_date < CURRENT_DATE AND COALESCE(m.status, '') <> 'completed') AS is_overdue
        FROM public.site_milestones m
        JOIN public.project_sites ps
          ON ps.id = m.site_id AND ps.deleted_at IS NULL
        WHERE m.is_active
          AND m.start_date <= v_date_to
          AND m.end_date >= v_date_from
          AND (v_site_ids IS NULL OR m.site_id = ANY(v_site_ids))
      ),
      enriched AS (
        SELECT
          CASE v_row_key
            WHEN 'status'   THEN status
            WHEN 'priority' THEN priority
            WHEN 'month'    THEN month
            WHEN 'end_date' THEN end_date::text
            ELSE site
          END AS row_val,
          CASE v_col_key
            WHEN 'status'   THEN status
            WHEN 'priority' THEN priority
            WHEN 'month'    THEN month
            WHEN 'end_date' THEN end_date::text
            ELSE site
          END AS col_val,
          status,
          percent_complete,
          at_risk,
          is_overdue
        FROM base
      ),
      agg AS (
        SELECT
          row_val,
          col_val,
          CASE v_measure
            WHEN 'milestones' THEN COUNT(*)::numeric
            WHEN 'completed'  THEN COUNT(*) FILTER (WHERE status = 'completed')::numeric
            WHEN 'at_risk'    THEN COUNT(*) FILTER (WHERE at_risk)::numeric
            WHEN 'overdue'    THEN COUNT(*) FILTER (WHERE is_overdue)::numeric
            ELSE                   COALESCE(AVG(percent_complete), 0)::numeric(5,1)
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

-- 7. Registry seed -------------------------------------------------------------
-- ON CONFLICT (key) DO NOTHING, not DO UPDATE: re-running this migration must
-- never silently rewrite a dataset definition an admin has since adjusted. The
-- `key` values are what report_definitions.dataset_key references, and `source`
-- must match the function names created above exactly — the edge function calls
-- admin.rpc(dataset.source, ...) with no name mapping.
--
-- dimensions / measures are the flat [{key,label}] / [{key,label,agg}] arrays the
-- builder renders as its Rows / Columns / Values pickers. Every key listed here
-- is handled by a CASE branch (dimensions) or a CASE branch of v_measure
-- (measures) in the matching function.
INSERT INTO public.reportable_datasets
  (key, label, description, source, dimensions, measures, supports_matrix, is_active)
VALUES
  (
    'attendance',
    'Attendance',
    'Daily attendance per team member — status, hours and assigned site.',
    'get_attendance_report',
    '[
      {"key":"team_member","label":"Team member"},
      {"key":"status","label":"Status"},
      {"key":"date","label":"Date"},
      {"key":"site","label":"Site"}
    ]'::jsonb,
    '[
      {"key":"hours","label":"Hours","agg":"avg"},
      {"key":"days_present","label":"Days present","agg":"count"},
      {"key":"days_absent","label":"Days absent","agg":"count"},
      {"key":"half_days","label":"Half days","agg":"count"},
      {"key":"days_leave","label":"Days on leave","agg":"count"}
    ]'::jsonb,
    true,
    true
  ),
  (
    'procurement_orders',
    'Purchase orders',
    'Purchase orders by status, vendor, site and period, with order value.',
    'get_procurement_orders_report',
    '[
      {"key":"site","label":"Site"},
      {"key":"vendor","label":"Vendor"},
      {"key":"status","label":"Status"},
      {"key":"order_date","label":"Order date"},
      {"key":"month","label":"Month"}
    ]'::jsonb,
    '[
      {"key":"order_count","label":"Orders","agg":"count"},
      {"key":"total_value","label":"Total value","agg":"sum"}
    ]'::jsonb,
    true,
    true
  ),
  (
    'grn',
    'Goods receipts (GRN)',
    'Goods received per site and period, received quantity against ordered.',
    'get_grn_report',
    '[
      {"key":"site","label":"Site"},
      {"key":"vendor","label":"Vendor"},
      {"key":"product","label":"Item"},
      {"key":"status","label":"Status"},
      {"key":"receipt_date","label":"Receipt date"},
      {"key":"month","label":"Month"}
    ]'::jsonb,
    '[
      {"key":"received_qty","label":"Received qty","agg":"sum"},
      {"key":"ordered_qty","label":"Ordered qty","agg":"sum"},
      {"key":"variance_qty","label":"Variance","agg":"sum"},
      {"key":"grn_count","label":"Receipts","agg":"count"}
    ]'::jsonb,
    true,
    true
  ),
  (
    'site_milestones',
    'Site milestones',
    'Milestone progress per project site over time, with at-risk and overdue counts.',
    'get_site_milestones_report',
    '[
      {"key":"site","label":"Site"},
      {"key":"status","label":"Status"},
      {"key":"priority","label":"Priority"},
      {"key":"end_date","label":"Target date"},
      {"key":"month","label":"Month"}
    ]'::jsonb,
    '[
      {"key":"percent_complete","label":"Progress %","agg":"avg"},
      {"key":"milestones","label":"Milestones","agg":"count"},
      {"key":"completed","label":"Completed","agg":"count"},
      {"key":"at_risk","label":"At risk","agg":"count"},
      {"key":"overdue","label":"Overdue","agg":"count"}
    ]'::jsonb,
    true,
    true
  )
ON CONFLICT (key) DO NOTHING;

-- 8. Grants --------------------------------------------------------------------
-- The edge function calls these as service_role; the builder's preview path calls
-- them as the signed-in user. Nothing is granted to anon.
GRANT EXECUTE ON FUNCTION public.report_scope_user_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.report_scope_site_ids(uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_attendance_report(text, text, text, text[], jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_procurement_orders_report(text, text, text, text[], jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_grn_report(text, text, text, text[], jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_site_milestones_report(text, text, text, text[], jsonb) TO authenticated, service_role;
