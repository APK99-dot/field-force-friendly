-- Wire the Notification Centre to domain tables.
--
-- Until now emit_notification_event() existed but nothing called it, so rules
-- saved in the admin UI could never fire. These triggers connect them.
--
-- SCOPE: deliberately only the four modules that do NOT already notify from the
-- client. attendance, leave_applications, regularization_requests and the
-- approvals flow all dispatch notifications from React today
-- (useAttendance.ts, LeaveApplicationModal.tsx, RegularizationRequestModal.tsx,
-- AttendanceManagement.tsx, PendingApprovals.tsx). Adding triggers for those
-- without first removing the client calls would deliver everything twice, so
-- they are handled as a separate, deliberate change.
--
-- SAFE TO APPLY WITH RULES INACTIVE: emit_notification_event() loops over
-- notification_rules WHERE is_active. With none active it writes an event-log
-- row and sends nothing. Activating a rule is what turns delivery on.

-- 1. Purchase orders ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_procurement_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_site text;
  v_actor uuid;
BEGIN
  v_actor := COALESCE(NEW.created_by, auth.uid());
  SELECT site_name INTO v_site FROM project_sites WHERE id = NEW.site_id;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_notification_event(
      'RECORD_CREATED', 'procurement_orders', NEW.id::text, v_actor,
      jsonb_build_object('record_name', COALESCE(NEW.po_number, 'PO'),
                         'site_name', COALESCE(v_site, ''))
    );
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Only a status change is newsworthy; every edit would be noise.
    PERFORM public.emit_notification_event(
      'RECORD_UPDATED', 'procurement_orders', NEW.id::text, v_actor,
      jsonb_build_object('record_name',
                         COALESCE(NEW.po_number, 'PO') || ' — ' || COALESCE(NEW.status, ''),
                         'site_name', COALESCE(v_site, ''))
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_procurement_orders
  AFTER INSERT OR UPDATE OF status ON public.procurement_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_procurement_orders();

-- 2. Goods receipts -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_procurement_grns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := COALESCE(NEW.created_by, auth.uid());

  PERFORM public.emit_notification_event(
    'RECORD_CREATED', 'procurement_grns', NEW.id::text, v_actor,
    jsonb_build_object('record_name', COALESCE(NEW.grn_number, 'GRN'))
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_procurement_grns
  AFTER INSERT ON public.procurement_grns
  FOR EACH ROW EXECUTE FUNCTION public.notify_procurement_grns();

-- 3. Expenses -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_additional_expenses()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name text;
BEGIN
  v_name := COALESCE(NULLIF(NEW.custom_category, ''), NEW.category, 'Expense')
            || ' — ' || COALESCE(NEW.amount::text, '0');

  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_notification_event(
      'RECORD_CREATED', 'additional_expenses', NEW.id::text, NEW.user_id,
      jsonb_build_object('record_name', v_name)
    );
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Map the outcome onto the approve/reject event codes so a rule can target
    -- "approved" without also firing on "rejected".
    PERFORM public.emit_notification_event(
      CASE lower(COALESCE(NEW.status, ''))
        WHEN 'approved' THEN 'RECORD_APPROVED'
        WHEN 'rejected' THEN 'RECORD_REJECTED'
        ELSE 'RECORD_UPDATED'
      END,
      'additional_expenses', NEW.id::text, NEW.user_id,
      jsonb_build_object('record_name', v_name)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_additional_expenses
  AFTER INSERT OR UPDATE OF status ON public.additional_expenses
  FOR EACH ROW EXECUTE FUNCTION public.notify_additional_expenses();

-- 4. Site milestones ----------------------------------------------------------
-- site_milestones has no created_by, so the actor is whoever is making the
-- change right now. auth.uid() is NULL for a service-role write, which
-- emit_notification_event handles (the actor name falls back to "Someone").
CREATE OR REPLACE FUNCTION public.notify_site_milestones()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_site text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT site_name INTO v_site FROM project_sites WHERE id = NEW.site_id;

  PERFORM public.emit_notification_event(
    CASE lower(COALESCE(NEW.status, ''))
      WHEN 'completed' THEN 'ACTIVITY_COMPLETED'
      ELSE 'RECORD_UPDATED'
    END,
    'site_milestones', NEW.id::text, auth.uid(),
    jsonb_build_object('record_name', COALESCE(NEW.name, 'Milestone'),
                       'site_name', COALESCE(v_site, ''))
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_site_milestones
  AFTER UPDATE OF status ON public.site_milestones
  FOR EACH ROW EXECUTE FUNCTION public.notify_site_milestones();
