-- 1. Lock down every SECURITY DEFINER function in the public schema.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- 2. Re-grant only what the running application needs.

-- Helpers referenced inside RLS policies (must be callable by the querying role).
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_object(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_hierarchy(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_subordinate_users(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_scope_user_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_scope_site_ids(uuid) TO authenticated;

-- RPCs invoked directly by the signed-in client.
GRANT EXECUTE ON FUNCTION public.ensure_current_user(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_lead(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_report_subscription(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_all_managers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notif_pick_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notif_preview_recipients(text, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_send_test(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_monthly_leave_accruals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_notification(uuid, text, text, text, text, uuid) TO authenticated;

-- The only routine the unauthenticated vendor quote portal needs.
GRANT EXECUTE ON FUNCTION public.vendor_quote_token_open(text) TO anon, authenticated;
