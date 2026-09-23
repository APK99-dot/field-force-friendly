-- Re-attach orphaned goods receipts to their vendor.
--
-- THE BUG
-- ProcurementDetail lists a vendor's receipts with
--     grns.filter(g => g.vendor_id === row.vendor_id)          (line 2126)
-- so a procurement_grns row with a NULL vendor_id belongs to no vendor. The
-- vendor's Goods Receipts tab shows (0) and "No goods received from this vendor
-- yet" while the PO itself sits at Goods Received, because the PO status is
-- advanced by a separate UPDATE that does not care about the vendor.
--
-- Receipts booked from the procurement screen were fine: GRNForm sets vendor_id
-- and even carries a comment warning that a null "orphans the receipt from the
-- vendor row" (GRNForm.tsx:217). Receipts booked from an ACTIVITY were not —
-- CreativeActivityForm's insert simply omitted the column. Fixed in the same
-- commit as this migration.
--
-- THE BACKFILL
-- Every already-orphaned receipt is re-attached wherever the vendor is
-- unambiguous:
--
--   1. procurement_orders.vendor_id, when set. This is a denormalised copy of
--      derivedVendorIds[0] written when a PO is saved from the procurement
--      screen (ProcurementDetail.tsx:819).
--   2. Otherwise the single distinct vendor across the PO's line assignments,
--      procurement_items.vendor_ids. Quote-flow POs leave
--      procurement_orders.vendor_id NULL and keep the vendor only here, which
--      is the case that produced the report (GRNForm.tsx:80 documents the same
--      trap).
--
-- A PO whose lines carry two or more distinct vendors is deliberately SKIPPED.
-- Nothing in a receipt records which vendor delivered, so any pick would be a
-- guess, and filing a receipt against the wrong vendor is worse than leaving it
-- unattached — it corrupts that vendor's financial summary. Those rows stay
-- NULL and must be assigned by hand.
--
-- Idempotent: only touches rows that are still NULL.

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
    -- procurement_items' FK to the order is `procurement_id`, NOT `po_id`.
    -- procurement_grns and procurement_invoices are the tables whose PO FK is
    -- called po_id.
    SELECT
      COUNT(DISTINCT vid)              AS vendor_count,
      (ARRAY_AGG(DISTINCT vid))[1]     AS only_vendor
    FROM public.procurement_items pi
    CROSS JOIN LATERAL unnest(COALESCE(pi.vendor_ids, '{}'::uuid[])) AS vid
    WHERE pi.procurement_id = o.id
  ) lv ON true
  WHERE g2.vendor_id IS NULL
) r
WHERE g.id = r.id
  AND r.resolved_vendor_id IS NOT NULL;
