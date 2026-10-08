-- Move two procurement invariants out of the browser and into the database,
-- and repair the rows the browser-only versions left behind.
--
-- BACKGROUND — why these keep recurring
-- Both rules were implemented only in React, in one screen each:
--   * A goods receipt's vendor was set by GRNForm but omitted by
--     CreativeActivityForm, so receipts booked from an activity were orphaned.
--   * A PO line's rate was copied from the winning quote by an effect inside
--     ProcurementDetail that runs when the drawer OPENS (its line 1545). A PO
--     nobody opened kept rate 0, so the invoice form showed PO Rate 0.00,
--     Amount 0.00 and Invoice Total 0.00.
-- Any path that does not go through the screen holding the rule diverges
-- silently. Fixing each caller as it is reported is endless; the rules belong
-- where no caller can skip them.
--
-- The rate rule now also runs server-side in submit-vendor-quote (same commit),
-- which is where it belongs: the rate lands when the vendor submits, not when
-- somebody happens to open a drawer. This migration covers the receipt rule and
-- repairs existing data for both.

-- 1. A goods receipt is never written without a vendor ------------------------
-- BEFORE INSERT so it applies to every writer — the activity form, GRNForm, the
-- Salesforce import, a manual SQL insert — including deployments still running
-- an older bundle. Resolution matches CreativeActivityForm and GRNForm: the
-- order's denormalised vendor_id first, then the line assignments, and only
-- when they name ONE unambiguous vendor. A split PO records nothing about who
-- delivered, so a guess there would corrupt that vendor's financial summary;
-- those stay NULL and are assigned by hand.
CREATE OR REPLACE FUNCTION public.set_procurement_grn_vendor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_vendor uuid;
  v_count  int;
BEGIN
  IF NEW.vendor_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT o.vendor_id INTO v_vendor
  FROM public.procurement_orders o
  WHERE o.id = NEW.po_id;

  IF v_vendor IS NULL THEN
    SELECT COUNT(DISTINCT vid), (ARRAY_AGG(DISTINCT vid))[1]
      INTO v_count, v_vendor
    FROM public.procurement_items pi
    CROSS JOIN LATERAL unnest(COALESCE(pi.vendor_ids, '{}'::uuid[])) AS vid
    WHERE pi.procurement_id = NEW.po_id;

    IF v_count IS DISTINCT FROM 1 THEN
      v_vendor := NULL;
    END IF;
  END IF;

  NEW.vendor_id := v_vendor;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_set_procurement_grn_vendor ON public.procurement_grns;
CREATE TRIGGER trg_set_procurement_grn_vendor
  BEFORE INSERT OR UPDATE OF vendor_id, po_id ON public.procurement_grns
  FOR EACH ROW EXECUTE FUNCTION public.set_procurement_grn_vendor();

-- 2. Re-attach already-orphaned receipts ---------------------------------------
-- Same statement as 20260923090000, repeated because that migration was never
-- applied. Idempotent: only touches rows still NULL.
UPDATE public.procurement_grns g
SET vendor_id  = r.resolved_vendor_id,
    updated_at = now()
FROM (
  SELECT
    g2.id,
    COALESCE(
      o.vendor_id,
      CASE WHEN lv.vendor_count = 1 THEN lv.only_vendor END
    ) AS resolved_vendor_id
  FROM public.procurement_grns g2
  JOIN public.procurement_orders o ON o.id = g2.po_id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(DISTINCT vid)          AS vendor_count,
      (ARRAY_AGG(DISTINCT vid))[1] AS only_vendor
    FROM public.procurement_items pi
    CROSS JOIN LATERAL unnest(COALESCE(pi.vendor_ids, '{}'::uuid[])) AS vid
    WHERE pi.procurement_id = o.id
  ) lv ON true
  WHERE g2.vendor_id IS NULL
) r
WHERE g.id = r.id
  AND r.resolved_vendor_id IS NOT NULL;

-- 3. Price the lines the browser never got round to ----------------------------
-- Applies the winning quote's rate to every line still sitting at 0, by exactly
-- the rule ProcurementDetail uses, then refreshes the header total of the orders
-- touched.
--
-- Skipped, deliberately:
--   * rate_source = 'manual'        — a rate the buyer typed wins over a quote.
--   * rate_source_vendor_id NOT NULL — a vendor has already been picked.
--   * lines quoted by more than one latest-submitted vendor — the buyer chooses
--     the winner; picking the newest version here would silently award the PO.
--
-- Two statements inside a DO block rather than one CTE chain: a data-modifying
-- CTE is invisible to the rest of its own statement, so recomputing the totals
-- in the same statement would sum the pre-update amounts.
DO $rates$
BEGIN
  CREATE TEMP TABLE _repriced (po_id uuid) ON COMMIT DROP;

  WITH candidate AS (
    SELECT
      pi.id                                                                  AS item_id,
      COUNT(*)                                                               AS quote_count,
      (ARRAY_AGG(q.vendor_id ORDER BY q.version DESC))[1]                    AS vendor_id,
      (ARRAY_AGG(COALESCE(qi.rate_after_discount, qi.rate) ORDER BY q.version DESC))[1] AS rate,
      (ARRAY_AGG(COALESCE(qi.gst_percent, 0) ORDER BY q.version DESC))[1]    AS gst
    FROM public.procurement_items pi
    JOIN public.procurement_vendor_quote_items qi ON qi.procurement_item_id = pi.id
    JOIN public.procurement_vendor_quotes q       ON q.id = qi.quote_id
    WHERE COALESCE(pi.rate, 0) = 0
      AND pi.rate_source_vendor_id IS NULL
      AND COALESCE(pi.rate_source, '') <> 'manual'
      AND q.is_latest
      AND q.status = 'submitted'
      AND COALESCE(qi.rate_after_discount, qi.rate) > 0
      AND q.vendor_id IS NOT NULL
    GROUP BY pi.id
  ),
  upd AS (
    UPDATE public.procurement_items pi
    SET rate                  = c.rate,
        amount                = c.rate * COALESCE(pi.qty, 0),
        gst_percent           = c.gst,
        rate_source           = 'quote',
        rate_source_vendor_id = c.vendor_id,
        vendor_ids            = CASE
          WHEN c.vendor_id = ANY(COALESCE(pi.vendor_ids, '{}'::uuid[]))
            THEN pi.vendor_ids
          ELSE COALESCE(pi.vendor_ids, '{}'::uuid[]) || c.vendor_id
        END,
        updated_at            = now()
    FROM candidate c
    WHERE pi.id = c.item_id
      AND c.quote_count = 1
    RETURNING pi.procurement_id
  )
  INSERT INTO _repriced (po_id)
  SELECT DISTINCT procurement_id FROM upd;

  UPDATE public.procurement_orders o
  SET total_amount = (
        SELECT COALESCE(SUM(x.amount * (1 + COALESCE(x.gst_percent, 0) / 100.0)), 0)
        FROM public.procurement_items x
        WHERE x.procurement_id = o.id
      ),
      updated_at = now()
  WHERE o.id IN (SELECT po_id FROM _repriced);

  RAISE NOTICE 'repriced lines on % purchase order(s)', (SELECT COUNT(*) FROM _repriced);
END;
$rates$;
