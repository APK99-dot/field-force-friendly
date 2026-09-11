-- Switch off the per-record notifications the two 19:00 digests replace.
--
-- The digests seeded in 20260911092000 now carry the same information once a
-- day instead of one push per record:
--   "Daily activity report"         <- every activity raised that day
--   "Daily PO status change report" <- every PO created or moved that day
-- so the individual pushes are duplicated noise.
--
-- WHAT IS TURNED OFF, AND WHY THESE THREE
--   activity_events     / RECORD_CREATED  -> covered by the activity digest
--   procurement_orders  / RECORD_CREATED  -> covered by the PO digest, which
--                                            reports a new PO as a change with
--                                            from_status NULL, rendered "New"
--   procurement_orders  / RECORD_UPDATED  -> the status-change push itself
--
-- Matched on (event_code, source_table) rather than on name. The seeded names
-- carry an em-dash ("PO status changed — notify admins") and a rule renamed in
-- the Notification Centre would slip past a name match, while the event/table
-- pair is what emit_notification_event() actually dispatches on.
--
-- Everything else is left alone: goods receipts, expenses and milestones have
-- no digest to replace them, so their rules keep firing.
--
-- REVERSIBLE. This flips is_active, it does not delete anything. To bring a rule
-- back, switch it on in Notification Centre > Notification Center, or run the
-- rollback statement at the foot of this file. The triggers in 20260805100000
-- and 20260824090000 are untouched and keep writing notification_event_log
-- rows, so the audit trail continues either way.
--
-- ONE THING TO KNOW: 20260824090000 ends with an unconditional
--   UPDATE public.notification_rules SET is_active = true
--    WHERE name = 'Activity created — notify admins';
-- Re-applying that migration would switch the activity rule back on. This
-- migration is dated after it, so a forward-only migration run is safe; only a
-- deliberate re-run of the older file would undo it.

UPDATE public.notification_rules
SET is_active = false
WHERE (event_code, source_table) IN (
        ('RECORD_CREATED', 'activity_events'),
        ('RECORD_CREATED', 'procurement_orders'),
        ('RECORD_UPDATED', 'procurement_orders')
      )
  AND is_active;

-- Rollback, for reference — not run:
--
-- UPDATE public.notification_rules
-- SET is_active = true
-- WHERE (event_code, source_table) IN (
--         ('RECORD_CREATED', 'activity_events'),
--         ('RECORD_CREATED', 'procurement_orders'),
--         ('RECORD_UPDATED', 'procurement_orders')
--       );
