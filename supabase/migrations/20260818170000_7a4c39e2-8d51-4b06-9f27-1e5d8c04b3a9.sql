-- Give notifications the columns the delivery history needs, and let admins
-- read it org-wide.
--
-- The Notification History tab showed notification_event_log — what fired —
-- which is why every row read "Recipients 0". That table records events, not
-- deliveries, so it can never answer the question actually being asked: did
-- this person open it.
--
-- staging-quickapp answers it from the notifications table itself, with four
-- columns this schema never had. Adding them here so the same tab can be
-- ported rather than reinvented.
--
--   read_at         when the recipient opened it (is_read alone gives no time)
--   delivery_status per-notification outcome, for the Delivery column
--   deleted_at      soft delete, so dismissing does not destroy the record
--   metadata        trigger_type / is_test, which drive Auto vs Manual
--
-- All four are nullable with no default beyond delivery_status, so existing
-- rows stay valid and nothing has to be backfilled. Historic rows will show a
-- blank Read at, which is honest — that timestamp was never captured.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS read_at         timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_status text DEFAULT 'delivered',
  ADD COLUMN IF NOT EXISTS deleted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS metadata        jsonb;

-- Back-fill read_at for rows already marked read. now() would be a lie — the
-- read happened at some unknown earlier point — so created_at is used as the
-- floor, making it clear these are historic rather than freshly opened.
UPDATE public.notifications
SET read_at = created_at
WHERE is_read IS TRUE AND read_at IS NULL;

-- Admins need to see everyone's notifications for the history to be org-wide.
-- The existing owner-only SELECT policy stays; Postgres ORs permissive
-- policies, so users keep reading their own and nothing else changes for them.
DROP POLICY IF EXISTS "Admins can view all notifications" ON public.notifications;
CREATE POLICY "Admins can view all notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- The history sorts and filters on these two.
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read  ON public.notifications(user_id, is_read);
