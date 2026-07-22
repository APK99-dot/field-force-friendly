
CREATE OR REPLACE FUNCTION public.prevent_client_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  -- Allow service_role (edge functions / backend maintenance) to proceed.
  IF v_role = 'service_role' OR current_user = 'postgres' OR current_user = 'supabase_admin' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Physical deletion of % is disabled. Deactivate the record instead.', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_client_delete_users ON public.users;
CREATE TRIGGER trg_prevent_client_delete_users
  BEFORE DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.prevent_client_hard_delete();

DROP TRIGGER IF EXISTS trg_prevent_client_delete_employees ON public.employees;
CREATE TRIGGER trg_prevent_client_delete_employees
  BEFORE DELETE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.prevent_client_hard_delete();

DROP TRIGGER IF EXISTS trg_prevent_client_delete_attendance ON public.attendance;
CREATE TRIGGER trg_prevent_client_delete_attendance
  BEFORE DELETE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.prevent_client_hard_delete();

DROP TRIGGER IF EXISTS trg_prevent_client_delete_leave_apps ON public.leave_applications;
CREATE TRIGGER trg_prevent_client_delete_leave_apps
  BEFORE DELETE ON public.leave_applications
  FOR EACH ROW EXECUTE FUNCTION public.prevent_client_hard_delete();

DROP TRIGGER IF EXISTS trg_prevent_client_delete_activity_events ON public.activity_events;
CREATE TRIGGER trg_prevent_client_delete_activity_events
  BEFORE DELETE ON public.activity_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_client_hard_delete();

DROP TRIGGER IF EXISTS trg_prevent_client_delete_additional_expenses ON public.additional_expenses;
CREATE TRIGGER trg_prevent_client_delete_additional_expenses
  BEFORE DELETE ON public.additional_expenses
  FOR EACH ROW EXECUTE FUNCTION public.prevent_client_hard_delete();
