-- Seed a starting set of notification rules.
--
-- ALL SEEDED INACTIVE (is_active = false). emit_notification_event() only loops
-- over active rules, so nothing is delivered until someone switches a rule on in
-- the Notification Centre. Turn them on one at a time and watch what each
-- produces before enabling the next.
--
-- Only modules that actually have triggers are covered: procurement_orders,
-- procurement_grns, additional_expenses and site_milestones (20260805100000).
-- Rules for attendance, leave or regularization are deliberately NOT seeded —
-- those still notify from the client and have no trigger, so such a rule would
-- sit there looking configured while never firing.
--
-- Placeholders available: {user_name} {module_name} {record_name} {site_name} {date}
-- Re-runnable: each row is skipped if a rule with the same name already exists.

INSERT INTO public.notification_rules
  (name, event_code, source_table, receiver_type, notification_channel,
   title_template, message_template, is_active)
SELECT v.name, v.event_code, v.source_table, v.receiver_type, v.channel,
       v.title, v.message, false
FROM (VALUES
  -- Procurement ---------------------------------------------------------------
  ('PO raised — notify admins',
   'RECORD_CREATED', 'procurement_orders', 'admin', 'push',
   'New PO — {record_name}',
   '{user_name} raised {record_name} for {site_name} on {date}.'),

  ('PO status changed — notify admins',
   'RECORD_UPDATED', 'procurement_orders', 'admin', 'push',
   'PO updated — {record_name}',
   '{user_name} changed {record_name} at {site_name} on {date}.'),

  -- Goods receipts -------------------------------------------------------------
  ('Goods received — notify admins',
   'RECORD_CREATED', 'procurement_grns', 'admin', 'push',
   'Goods received — {record_name}',
   '{user_name} filed {record_name} on {date}.'),

  -- Expenses -------------------------------------------------------------------
  ('Expense submitted — notify the manager',
   'RECORD_CREATED', 'additional_expenses', 'manager', 'push',
   'Expense submitted — {record_name}',
   '{user_name} submitted {record_name} on {date}. Awaiting your approval.'),

  ('Expense approved — notify the submitter',
   'RECORD_APPROVED', 'additional_expenses', 'employee', 'push',
   'Expense approved',
   'Your expense {record_name} was approved on {date}.'),

  ('Expense rejected — notify the submitter',
   'RECORD_REJECTED', 'additional_expenses', 'employee', 'push',
   'Expense rejected',
   'Your expense {record_name} was rejected on {date}.'),

  -- Site progress --------------------------------------------------------------
  ('Milestone completed — notify admins',
   'ACTIVITY_COMPLETED', 'site_milestones', 'admin', 'push',
   'Milestone completed — {record_name}',
   '{record_name} at {site_name} was marked complete on {date}.')
) AS v(name, event_code, source_table, receiver_type, channel, title, message)
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_rules r WHERE r.name = v.name
);
