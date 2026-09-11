-- Activate the two end-of-day digests.
--
-- 20260911092000 seeded them paused so the first delivery would be a deliberate
-- "Run now" rather than an unattended 19:00 send to every admin. That rehearsal
-- is done: both reports were fired manually against a single recipient, the
-- files and the push notification arrived, and the recipient list was widened
-- back to the same admins who receive the check-out report.
--
-- This migration is what makes a replay on a fresh database land where the live
-- database actually is. Without it, a rebuilt environment would come up with
-- both subscriptions paused and nothing would fire at 19:00.
--
-- Recipients are NOT touched here — 20260911092000 already copies them from the
-- "Daily check-out report" row, which is where they ended up. Only the status
-- changes.
--
-- Guarded on status so re-applying is a no-op, and so it can never revive a
-- subscription somebody has deliberately paused since.

UPDATE public.report_subscriptions
SET status     = 'active',
    updated_at = now()
WHERE name IN ('Daily activity report', 'Daily PO status change report')
  AND status = 'paused';
