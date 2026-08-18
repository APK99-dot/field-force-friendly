-- Re-attach the push trigger to notifications.
--
-- 20260408062303 dropped the trigger AND the function:
--
--   DROP TRIGGER IF EXISTS on_notification_inserted ON public.notifications;
--   DROP FUNCTION IF EXISTS public.notify_push_on_insert();
--
-- Every migration since has recreated the FUNCTION with CREATE OR REPLACE —
-- the pg_net schema fix in 20260807060000, the route passthrough earlier
-- today — so it has been present and correct the whole time. Nothing ever
-- recreated the TRIGGER, so the function was wired to nothing and no
-- notification row has ever pushed through this path.
--
-- That is why activating the rules produced bell entries and silence on the
-- phone: emit_notification_event inserts, and inserting was the end of it.
-- Confirmed by net._http_response, which holds nothing but report-dispatcher
-- ticks on the quarter hour — not one call to send-push-notification.
--
-- Urgent rather than cosmetic: dispatch-notification has just stopped pushing
-- on the assumption this trigger would take over. Without it, the next edge
-- function deploy turns "rules do not push" into "nothing pushes", including
-- the daily attendance reports.

DROP TRIGGER IF EXISTS on_notification_inserted ON public.notifications;
CREATE TRIGGER on_notification_inserted
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_push_on_insert();
