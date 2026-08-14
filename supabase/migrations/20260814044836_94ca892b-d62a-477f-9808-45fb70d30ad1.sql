-- 1. Missing indexes
CREATE INDEX IF NOT EXISTS idx_procurement_items_procurement_id ON public.procurement_items (procurement_id);
CREATE INDEX IF NOT EXISTS idx_gps_tracking_user_date ON public.gps_tracking (user_id, date);
CREATE INDEX IF NOT EXISTS idx_gps_tracking_timestamp ON public.gps_tracking ("timestamp");
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id, is_read, created_at DESC);

-- 6. Retention / cleanup
CREATE OR REPLACE FUNCTION public.maintenance_cleanup()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_http bigint := 0;
  v_cron bigint := 0;
  v_gps  bigint := 0;
BEGIN
  BEGIN
    DELETE FROM net._http_response WHERE created < now() - interval '3 days';
    GET DIAGNOSTICS v_http = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN v_http := -1;
  END;

  BEGIN
    DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';
    GET DIAGNOSTICS v_cron = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN v_cron := -1;
  END;

  DELETE FROM public.gps_tracking WHERE date < (current_date - 90);
  GET DIAGNOSTICS v_gps = ROW_COUNT;

  RETURN format('http=%s cron=%s gps=%s', v_http, v_cron, v_gps);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.maintenance_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maintenance_cleanup() TO service_role;

SELECT cron.unschedule('nightly-maintenance-cleanup')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nightly-maintenance-cleanup');

SELECT cron.schedule('nightly-maintenance-cleanup', '30 19 * * *', $$SELECT public.maintenance_cleanup();$$);