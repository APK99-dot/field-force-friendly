-- Re-sync PO lines that are still holding a superseded quote's figures.
--
-- THE SYMPTOM
-- A vendor's quote is reopened, revised and resubmitted. The PO document comes
-- out with the new rate and GST, because generatePoForVendor reads the quote
-- directly. Everything that reads the PO LINE instead — the Vendor Comparison
-- card header, the invoice form's Line Items, the per-vendor financial summary
-- — keeps showing the V1 figures. One screen even disagrees with itself: the
-- comparison's vendor row reads qi.gst_percent and shows 18%, while the card
-- above it reads the line and shows "No GST (0%)".
--
-- THE CAUSE
-- procurement_items.rate / gst_percent are only refreshed by code that bailed
-- out on exactly this case. submit-vendor-quote skipped any line that already
-- had a rate_source_vendor_id — which a line always has once V1 was applied —
-- and so never updated a line on resubmission. (Fixed in the same commit: a
-- revision from the vendor who already holds the line now refreshes it, while
-- a line won by someone else, or edited by the buyer, is still left alone.)
--
-- ProcurementDetail does carry a client-side re-sync for this, but it only runs
-- while someone has the PO drawer open, so any PO nobody opened after the
-- resubmission stayed stale — and that is what this migration repairs.
--
-- THE RULE, matching both of those:
--   * only lines tagged rate_source = 'quote' — 'manual' and 'manual_adjusted'
--     are the buyer's figures and are never overwritten;
--   * only against the LATEST SUBMITTED quote of the vendor that line already
--     belongs to, so nothing changes hands;
--   * only when that quote actually carries a positive rate;
--   * only when something genuinely differs, with the same 0.005 tolerance the
--     client uses, so an unchanged line is not touched.
--
-- Order totals are recomputed GST-inclusive, matching what the procurement
-- screen writes (poTotals.grand = subtotal + gst).

DO $resync$
BEGIN
  CREATE TEMP TABLE _resynced (po_id uuid) ON COMMIT DROP;

  WITH current_quote AS (
    SELECT
      qi.procurement_item_id                      AS item_id,
      q.vendor_id                                 AS vendor_id,
      COALESCE(qi.rate_after_discount, qi.rate)   AS rate,
      COALESCE(qi.gst_percent, 0)                 AS gst
    FROM public.procurement_vendor_quotes q
    JOIN public.procurement_vendor_quote_items qi ON qi.quote_id = q.id
    WHERE q.is_latest
      AND q.status = 'submitted'
      AND q.vendor_id IS NOT NULL
      AND qi.procurement_item_id IS NOT NULL
  ),
  upd AS (
    UPDATE public.procurement_items pi
    SET rate        = cq.rate,
        amount      = cq.rate * COALESCE(pi.qty, 0),
        gst_percent = cq.gst,
        updated_at  = now()
    FROM current_quote cq
    WHERE cq.item_id = pi.id
      AND cq.vendor_id = pi.rate_source_vendor_id
      AND pi.rate_source = 'quote'
      AND cq.rate > 0
      AND (
            ABS(COALESCE(pi.rate, 0) - cq.rate) > 0.005
         OR COALESCE(pi.gst_percent, 0) <> cq.gst
          )
    RETURNING pi.procurement_id
  )
  INSERT INTO _resynced (po_id)
  SELECT DISTINCT procurement_id FROM upd;

  UPDATE public.procurement_orders o
  SET total_amount = (
        SELECT COALESCE(SUM(x.amount * (1 + COALESCE(x.gst_percent, 0) / 100.0)), 0)
        FROM public.procurement_items x
        WHERE x.procurement_id = o.id
      ),
      updated_at = now()
  WHERE o.id IN (SELECT po_id FROM _resynced);

  RAISE NOTICE 're-synced lines on % purchase order(s)', (SELECT COUNT(*) FROM _resynced);
END;
$resync$;
