-- Let any signed-in user see TODAY's attendance and today's approved leave.
--
-- My Team listed every active user but could only read attendance rows RLS
-- allowed — self, admins, and a manager's own reports. Anyone else's row was
-- filtered out, and the UI rendered a missing row as "Absent". So the screen
-- was not reporting that someone had not checked in; it was reporting that the
-- viewer could not see whether they had. Those are different facts and it
-- stated the wrong one.
--
-- Widening the read fixes it at the source, and matches a decision already
-- made: widget_admin_attendance_overview is granted to every profile, so all
-- users already see the team's present / checked-in totals on the dashboard.
-- This makes the per-person list agree with the totals they are shown.
--
-- SCOPE IS DELIBERATELY TODAY ONLY. Both policies keep their CURRENT_DATE
-- bound, so attendance history stays restricted to the owner, their managers
-- and admins by the other policies on these tables. Today's presence becomes
-- shared; the record over time does not.
--
-- Side benefit: the policies these replace called get_user_hierarchy() and
-- get_subordinate_users() for every candidate row, on the hottest read in the
-- app. Both are gone, which is a real saving on a database already flagged for
-- disk I/O.
--
-- The other SELECT policies on these tables are untouched. Postgres ORs
-- permissive policies together, so nobody loses any access they have today.

DROP POLICY IF EXISTS "Self and managers view today's attendance" ON public.attendance;
CREATE POLICY "Authenticated view today's attendance"
  ON public.attendance FOR SELECT TO authenticated
  USING (date = CURRENT_DATE);

DROP POLICY IF EXISTS "Self and managers view approved leaves today" ON public.leave_applications;
CREATE POLICY "Authenticated view approved leaves today"
  ON public.leave_applications FOR SELECT TO authenticated
  USING (
    status = 'approved'
    AND from_date <= CURRENT_DATE
    AND to_date >= CURRENT_DATE
  );
