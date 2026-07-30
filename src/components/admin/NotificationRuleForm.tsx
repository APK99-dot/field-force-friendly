import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { X, Send, Bell, ChevronDown, Info } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export interface NotificationRuleRow {
  id: string;
  name: string;
  event_code: string;
  source_table: string;
  receiver_type: string;
  receiver_role: string | null;
  receiver_user_id: string | null;
  notification_channel: string;
  title_template: string;
  message_template: string;
  timezone?: string | null;
  is_active?: boolean;
}

interface NotificationRuleFormProps {
  rule: NotificationRuleRow | null;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}

export const TIMEZONES: { value: string; label: string }[] = [
  { value: "Asia/Kolkata", label: "IST — Asia/Kolkata" },
  { value: "Asia/Dubai", label: "GST — Asia/Dubai" },
  { value: "Asia/Singapore", label: "SGT — Asia/Singapore" },
  { value: "Asia/Bangkok", label: "ICT — Asia/Bangkok" },
  { value: "Asia/Dhaka", label: "BST — Asia/Dhaka" },
  { value: "Asia/Karachi", label: "PKT — Asia/Karachi" },
  { value: "Asia/Colombo", label: "SLT — Asia/Colombo" },
  { value: "Europe/London", label: "GMT/BST — Europe/London" },
  { value: "America/New_York", label: "ET — America/New_York" },
  { value: "America/Los_Angeles", label: "PT — America/Los_Angeles" },
  { value: "UTC", label: "UTC" },
];

// Mirrors notif_fill()'s {date}: TO_CHAR(now() AT TIME ZONE tz, 'DD Mon YYYY').
const formatDateInTz = (tz: string) => {
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" };
  try {
    return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: tz }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-GB", opts).format(new Date());
  }
};

// Mirrors notif_fill()'s {module_name}: INITCAP(REPLACE(source_table, '_', ' ')).
const initcapModule = (table: string) =>
  (table || "")
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");

// Every value below is a real table in this database — verified against
// supabase/migrations CREATE TABLE statements and src/integrations/supabase/types.ts.
export const SOURCE_TABLES: { value: string; label: string }[] = [
  { value: "attendance", label: "Attendance" },
  { value: "leave_applications", label: "Leave Applications" },
  { value: "regularization_requests", label: "Attendance Regularizations" },
  { value: "activity_events", label: "Site Activities" },
  { value: "visits", label: "Visits" },
  { value: "pm_projects", label: "Projects" },
  { value: "pm_tasks", label: "Project Tasks" },
  { value: "project_sites", label: "Sites" },
  { value: "site_milestones", label: "Site Milestones" },
  { value: "procurement_orders", label: "Purchase Orders" },
  { value: "procurement_grns", label: "Goods Receipt Notes" },
  { value: "procurement_invoices", label: "Vendor Invoices" },
  { value: "vendors", label: "Vendors" },
  { value: "additional_expenses", label: "Expenses" },
  { value: "leads", label: "Leads" },
  { value: "customers", label: "Customers" },
  { value: "customer_opportunities", label: "Opportunities" },
  { value: "events", label: "Events" },
  { value: "employees", label: "Employees" },
];

export const RECEIVER_OPTIONS: { value: string; label: string }[] = [
  { value: "employee", label: "The person themselves" },
  { value: "manager", label: "Their manager" },
  { value: "hierarchy", label: "Whole reporting chain" },
  { value: "role", label: "A role" },
  { value: "specific_user", label: "Specific people" },
  { value: "admin", label: "All admins" },
];

// app_role enum values in this database.
export const APP_ROLES: { value: string; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "user", label: "User" },
  { value: "data_viewer", label: "Data Viewer" },
  { value: "sales_manager", label: "Sales Manager" },
];

// notification_channel is CHECK-constrained to ('in_app','push'); email is shown
// disabled as a roadmap affordance and is never persisted.
export const CHANNELS: { value: string; label: string; disabled: boolean }[] = [
  { value: "in_app", label: "In-app", disabled: false },
  { value: "push", label: "In-app + push", disabled: false },
  { value: "email", label: "Email (coming soon)", disabled: true },
];

const SAVABLE_CHANNELS = new Set(["in_app", "push"]);

// Module -> Sub-event tree. Each sub-event maps to (source_table, event_code)
// plus default templates. event_code values are constrained by the
// notification_event_types foreign key — only the ten seeded codes are valid.
type SubEvent = {
  value: string;
  label: string;
  source_table: string;
  event_code: string;
  title: string;
  message: string;
};

const MODULE_SUB_EVENTS: Record<string, SubEvent[]> = {
  attendance: [
    {
      value: "checked_in",
      label: "Check-in",
      source_table: "attendance",
      event_code: "RECORD_CREATED",
      title: "{user_name} — checked in",
      message: "{user_name} checked in at {site_name} on {date}.",
    },
    {
      value: "checked_out",
      label: "Check-out",
      source_table: "attendance",
      event_code: "RECORD_UPDATED",
      title: "{user_name} — checked out",
      message: "{user_name} checked out of {site_name} on {date}.",
    },
  ],
  leave_applications: [
    {
      value: "leave_applied",
      label: "Leave applied",
      source_table: "leave_applications",
      event_code: "RECORD_CREATED",
      title: "Leave request — {user_name}",
      message: "{user_name} applied for leave on {date}. Request: {record_name}.",
    },
    {
      value: "leave_approved",
      label: "Leave approved",
      source_table: "leave_applications",
      event_code: "RECORD_APPROVED",
      title: "Leave approved — {user_name}",
      message: "Leave for {user_name} was approved on {date}.",
    },
    {
      value: "leave_rejected",
      label: "Leave rejected",
      source_table: "leave_applications",
      event_code: "RECORD_REJECTED",
      title: "Leave rejected — {user_name}",
      message: "Leave for {user_name} was rejected on {date}.",
    },
  ],
  regularization_requests: [
    {
      value: "regularization_raised",
      label: "Regularization raised",
      source_table: "regularization_requests",
      event_code: "RECORD_CREATED",
      title: "Regularization — {user_name}",
      message: "{user_name} raised an attendance regularization for {date}.",
    },
    {
      value: "regularization_approved",
      label: "Regularization approved",
      source_table: "regularization_requests",
      event_code: "RECORD_APPROVED",
      title: "Regularization approved — {user_name}",
      message: "The regularization raised by {user_name} was approved on {date}.",
    },
    {
      value: "regularization_rejected",
      label: "Regularization rejected",
      source_table: "regularization_requests",
      event_code: "RECORD_REJECTED",
      title: "Regularization rejected — {user_name}",
      message: "The regularization raised by {user_name} was rejected on {date}.",
    },
  ],
  activity_events: [
    {
      value: "activity_logged",
      label: "Activity logged",
      source_table: "activity_events",
      event_code: "RECORD_CREATED",
      title: "Site activity — {site_name}",
      message: "{user_name} logged {record_name} at {site_name} on {date}.",
    },
    {
      value: "activity_completed",
      label: "Activity completed",
      source_table: "activity_events",
      event_code: "ACTIVITY_COMPLETED",
      title: "Activity completed — {record_name}",
      message: "{user_name} completed {record_name} at {site_name} on {date}.",
    },
    {
      value: "activity_photo_uploaded",
      label: "Site photo uploaded",
      source_table: "activity_events",
      event_code: "FILE_UPLOADED",
      title: "Site photo — {site_name}",
      message: "{user_name} uploaded a photo for {record_name} at {site_name} on {date}.",
    },
  ],
  visits: [
    {
      value: "visit_logged",
      label: "Visit logged",
      source_table: "visits",
      event_code: "RECORD_CREATED",
      title: "Site visit — {site_name}",
      message: "{user_name} logged a visit to {site_name} on {date}.",
    },
    {
      value: "visit_updated",
      label: "Visit updated",
      source_table: "visits",
      event_code: "RECORD_UPDATED",
      title: "Visit updated — {site_name}",
      message: "{user_name} updated the visit to {site_name} on {date}.",
    },
  ],
  pm_projects: [
    {
      value: "project_created",
      label: "Project created",
      source_table: "pm_projects",
      event_code: "RECORD_CREATED",
      title: "New project — {record_name}",
      message: "{user_name} created the project {record_name} on {date}.",
    },
    {
      value: "project_updated",
      label: "Project updated",
      source_table: "pm_projects",
      event_code: "RECORD_UPDATED",
      title: "Project updated — {record_name}",
      message: "{user_name} updated the project {record_name} on {date}.",
    },
  ],
  pm_tasks: [
    {
      value: "task_created",
      label: "Task created",
      source_table: "pm_tasks",
      event_code: "RECORD_CREATED",
      title: "New task — {record_name}",
      message: "{user_name} created the task {record_name} on {date}.",
    },
    {
      value: "task_assigned",
      label: "Task assigned",
      source_table: "pm_tasks",
      event_code: "TASK_ASSIGNED",
      title: "Task assigned — {record_name}",
      message: "{user_name} assigned you {record_name} on {date}.",
    },
    {
      value: "task_completed",
      label: "Task completed",
      source_table: "pm_tasks",
      event_code: "ACTIVITY_COMPLETED",
      title: "Task completed — {record_name}",
      message: "{user_name} completed {record_name} on {date}.",
    },
    {
      value: "task_comment",
      label: "Comment added",
      source_table: "pm_tasks",
      event_code: "COMMENT_ADDED",
      title: "New comment — {record_name}",
      message: "{user_name} commented on {record_name} on {date}.",
    },
  ],
  project_sites: [
    {
      value: "site_created",
      label: "Site created",
      source_table: "project_sites",
      event_code: "RECORD_CREATED",
      title: "New site — {site_name}",
      message: "{user_name} added the site {site_name} on {date}.",
    },
    {
      value: "site_updated",
      label: "Site updated",
      source_table: "project_sites",
      event_code: "RECORD_UPDATED",
      title: "Site updated — {site_name}",
      message: "{user_name} updated {site_name} on {date}.",
    },
  ],
  site_milestones: [
    {
      value: "milestone_created",
      label: "Milestone created",
      source_table: "site_milestones",
      event_code: "RECORD_CREATED",
      title: "New milestone — {record_name}",
      message: "{user_name} added the milestone {record_name} for {site_name} on {date}.",
    },
    {
      value: "milestone_completed",
      label: "Milestone completed",
      source_table: "site_milestones",
      event_code: "ACTIVITY_COMPLETED",
      title: "Milestone reached — {record_name}",
      message: "{record_name} at {site_name} was marked complete by {user_name} on {date}.",
    },
  ],
  procurement_orders: [
    {
      value: "po_created",
      label: "PO raised",
      source_table: "procurement_orders",
      event_code: "RECORD_CREATED",
      title: "New purchase order — {record_name}",
      message: "{user_name} raised {record_name} for {site_name} on {date}.",
    },
    {
      value: "po_submitted",
      label: "PO submitted for approval",
      source_table: "procurement_orders",
      event_code: "RECORD_SUBMITTED",
      title: "PO awaiting approval — {record_name}",
      message: "{user_name} submitted {record_name} for approval on {date}.",
    },
    {
      value: "po_approved",
      label: "PO approved",
      source_table: "procurement_orders",
      event_code: "RECORD_APPROVED",
      title: "PO approved — {record_name}",
      message: "{record_name} for {site_name} was approved on {date}.",
    },
    {
      value: "po_rejected",
      label: "PO rejected",
      source_table: "procurement_orders",
      event_code: "RECORD_REJECTED",
      title: "PO rejected — {record_name}",
      message: "{record_name} for {site_name} was rejected on {date}.",
    },
  ],
  procurement_grns: [
    {
      value: "grn_created",
      label: "Material received (GRN)",
      source_table: "procurement_grns",
      event_code: "RECORD_CREATED",
      title: "Material received — {site_name}",
      message: "{user_name} recorded {record_name} at {site_name} on {date}.",
    },
    {
      value: "grn_approved",
      label: "GRN approved",
      source_table: "procurement_grns",
      event_code: "RECORD_APPROVED",
      title: "GRN approved — {record_name}",
      message: "{record_name} for {site_name} was approved on {date}.",
    },
  ],
  procurement_invoices: [
    {
      value: "invoice_created",
      label: "Vendor invoice logged",
      source_table: "procurement_invoices",
      event_code: "RECORD_CREATED",
      title: "Vendor invoice — {record_name}",
      message: "{user_name} logged {record_name} on {date}.",
    },
    {
      value: "invoice_submitted",
      label: "Invoice submitted for approval",
      source_table: "procurement_invoices",
      event_code: "RECORD_SUBMITTED",
      title: "Invoice awaiting approval — {record_name}",
      message: "{user_name} submitted {record_name} for approval on {date}.",
    },
    {
      value: "invoice_approved",
      label: "Invoice approved",
      source_table: "procurement_invoices",
      event_code: "RECORD_APPROVED",
      title: "Invoice approved — {record_name}",
      message: "{record_name} was approved for payment on {date}.",
    },
  ],
  vendors: [
    {
      value: "vendor_created",
      label: "Vendor added",
      source_table: "vendors",
      event_code: "RECORD_CREATED",
      title: "New vendor — {record_name}",
      message: "{user_name} added the vendor {record_name} on {date}.",
    },
    {
      value: "vendor_updated",
      label: "Vendor updated",
      source_table: "vendors",
      event_code: "RECORD_UPDATED",
      title: "Vendor updated — {record_name}",
      message: "{user_name} updated the vendor {record_name} on {date}.",
    },
  ],
  additional_expenses: [
    {
      value: "expense_submitted",
      label: "Expense submitted",
      source_table: "additional_expenses",
      event_code: "RECORD_CREATED",
      title: "Expense claim — {user_name}",
      message: "{user_name} submitted {record_name} for {site_name} on {date}.",
    },
    {
      value: "expense_approved",
      label: "Expense approved",
      source_table: "additional_expenses",
      event_code: "RECORD_APPROVED",
      title: "Expense approved — {record_name}",
      message: "{record_name} claimed by {user_name} was approved on {date}.",
    },
    {
      value: "expense_rejected",
      label: "Expense rejected",
      source_table: "additional_expenses",
      event_code: "RECORD_REJECTED",
      title: "Expense rejected — {record_name}",
      message: "{record_name} claimed by {user_name} was rejected on {date}.",
    },
  ],
  leads: [
    {
      value: "lead_created",
      label: "Lead created",
      source_table: "leads",
      event_code: "RECORD_CREATED",
      title: "New lead — {record_name}",
      message: "{user_name} added the lead {record_name} on {date}.",
    },
    {
      value: "lead_updated",
      label: "Lead updated",
      source_table: "leads",
      event_code: "RECORD_UPDATED",
      title: "Lead updated — {record_name}",
      message: "{user_name} updated the lead {record_name} on {date}.",
    },
  ],
  customers: [
    {
      value: "customer_created",
      label: "Customer added",
      source_table: "customers",
      event_code: "RECORD_CREATED",
      title: "New customer — {record_name}",
      message: "{user_name} added the customer {record_name} on {date}.",
    },
    {
      value: "customer_updated",
      label: "Customer updated",
      source_table: "customers",
      event_code: "RECORD_UPDATED",
      title: "Customer updated — {record_name}",
      message: "{user_name} updated {record_name} on {date}.",
    },
  ],
  customer_opportunities: [
    {
      value: "opportunity_created",
      label: "Opportunity created",
      source_table: "customer_opportunities",
      event_code: "RECORD_CREATED",
      title: "New opportunity — {record_name}",
      message: "{user_name} created the opportunity {record_name} on {date}.",
    },
    {
      value: "opportunity_updated",
      label: "Opportunity updated",
      source_table: "customer_opportunities",
      event_code: "RECORD_UPDATED",
      title: "Opportunity updated — {record_name}",
      message: "{user_name} updated {record_name} on {date}.",
    },
  ],
  events: [
    {
      value: "event_created",
      label: "Event scheduled",
      source_table: "events",
      event_code: "RECORD_CREATED",
      title: "New event — {record_name}",
      message: "{user_name} scheduled {record_name} on {date}.",
    },
    {
      value: "event_updated",
      label: "Event updated",
      source_table: "events",
      event_code: "RECORD_UPDATED",
      title: "Event updated — {record_name}",
      message: "{user_name} updated {record_name} on {date}.",
    },
  ],
  employees: [
    {
      value: "employee_created",
      label: "Employee onboarded",
      source_table: "employees",
      event_code: "RECORD_CREATED",
      title: "New joiner — {record_name}",
      message: "{user_name} onboarded {record_name} on {date}.",
    },
    {
      value: "employee_updated",
      label: "Employee record updated",
      source_table: "employees",
      event_code: "RECORD_UPDATED",
      title: "Employee updated — {record_name}",
      message: "{user_name} updated the record for {record_name} on {date}.",
    },
  ],
};

const MODULE_OPTIONS: { value: string; label: string }[] = [
  { value: "attendance", label: "Attendance" },
  { value: "leave_applications", label: "Leaves" },
  { value: "regularization_requests", label: "Regularization" },
  { value: "activity_events", label: "Site Activities" },
  { value: "visits", label: "Visits" },
  { value: "pm_projects", label: "Projects" },
  { value: "pm_tasks", label: "Project Tasks" },
  { value: "project_sites", label: "Sites" },
  { value: "site_milestones", label: "Site Milestones" },
  { value: "procurement_orders", label: "Purchase Orders" },
  { value: "procurement_grns", label: "Goods Receipt Notes" },
  { value: "procurement_invoices", label: "Vendor Invoices" },
  { value: "vendors", label: "Vendors" },
  { value: "additional_expenses", label: "Expenses" },
  { value: "leads", label: "Leads" },
  { value: "customers", label: "Customers" },
  { value: "customer_opportunities", label: "Opportunities" },
  { value: "events", label: "Events" },
  { value: "employees", label: "Employees" },
];

const inferInitialModule = (rule: NotificationRuleFormProps["rule"]): string => {
  if (!rule) return "";
  const found = Object.entries(MODULE_SUB_EVENTS).find(([, subs]) =>
    subs.some((s) => s.source_table === rule.source_table && s.event_code === rule.event_code),
  );
  return found ? found[0] : rule.source_table || "";
};

const inferInitialSubEvent = (rule: NotificationRuleFormProps["rule"], moduleValue: string): string => {
  if (!rule || !moduleValue) return "";
  const subs = MODULE_SUB_EVENTS[moduleValue];
  if (!subs) return "";
  const match = subs.find((s) => s.source_table === rule.source_table && s.event_code === rule.event_code);
  return match?.value || "";
};

// Only these five placeholders are substituted by notif_fill(). Anything else is
// left verbatim by the server, and the preview below behaves identically.
type ModulePreset = {
  title: string;
  message: string;
  tokens: string[];
  sample: { record_name: string; site_name: string };
};

const DEFAULT_PRESET: ModulePreset = {
  title: "{user_name} — {module_name}",
  message: "{user_name} performed an action on {module_name} on {date}.",
  tokens: ["{user_name}", "{module_name}", "{record_name}", "{site_name}", "{date}"],
  sample: { record_name: "Record #1", site_name: "Whitefield Tower A" },
};

const MODULE_PRESETS: Record<string, ModulePreset> = {
  attendance: {
    title: "{user_name} — attendance",
    message: "{user_name} marked attendance at {site_name} on {date}.",
    tokens: ["{user_name}", "{site_name}", "{date}", "{module_name}"],
    sample: { record_name: "Shift 09:00–18:00", site_name: "Whitefield Tower A" },
  },
  leave_applications: {
    title: "Leave request — {user_name}",
    message: "{user_name} applied for leave on {date}. Request: {record_name}.",
    tokens: ["{user_name}", "{record_name}", "{date}", "{module_name}"],
    sample: { record_name: "Casual leave — 1 day", site_name: "Whitefield Tower A" },
  },
  regularization_requests: {
    title: "Regularization — {user_name}",
    message: "{user_name} raised an attendance regularization for {date}.",
    tokens: ["{user_name}", "{record_name}", "{date}", "{module_name}"],
    sample: { record_name: "Missed check-out", site_name: "Whitefield Tower A" },
  },
  activity_events: {
    title: "Site activity — {site_name}",
    message: "{user_name} logged {record_name} at {site_name} on {date}.",
    tokens: ["{user_name}", "{record_name}", "{site_name}", "{date}"],
    sample: { record_name: "Slab concreting — Level 4", site_name: "Whitefield Tower A" },
  },
  visits: {
    title: "Site visit — {site_name}",
    message: "{user_name} logged a visit to {site_name} on {date}.",
    tokens: ["{user_name}", "{site_name}", "{record_name}", "{date}"],
    sample: { record_name: "Quality inspection", site_name: "Whitefield Tower A" },
  },
  pm_projects: {
    title: "Project — {record_name}",
    message: "{user_name} updated the project {record_name} on {date}.",
    tokens: ["{user_name}", "{record_name}", "{date}", "{module_name}"],
    sample: { record_name: "Whitefield Residences Ph-2", site_name: "Whitefield Tower A" },
  },
  pm_tasks: {
    title: "Task — {record_name}",
    message: "{user_name} updated {record_name} on {date}.",
    tokens: ["{user_name}", "{record_name}", "{site_name}", "{date}"],
    sample: { record_name: "Waterproofing — Basement 1", site_name: "Whitefield Tower A" },
  },
  project_sites: {
    title: "Site — {site_name}",
    message: "{user_name} updated {site_name} on {date}.",
    tokens: ["{user_name}", "{site_name}", "{date}", "{module_name}"],
    sample: { record_name: "Whitefield Tower A", site_name: "Whitefield Tower A" },
  },
  site_milestones: {
    title: "Milestone — {record_name}",
    message: "{record_name} at {site_name} was updated by {user_name} on {date}.",
    tokens: ["{user_name}", "{record_name}", "{site_name}", "{date}"],
    sample: { record_name: "Structure handover", site_name: "Whitefield Tower A" },
  },
  procurement_orders: {
    title: "Purchase order — {record_name}",
    message: "{user_name} raised {record_name} for {site_name} on {date}.",
    tokens: ["{user_name}", "{record_name}", "{site_name}", "{date}"],
    sample: { record_name: "PO-2041 — TMT bars", site_name: "Whitefield Tower A" },
  },
  procurement_grns: {
    title: "Material received — {site_name}",
    message: "{user_name} recorded {record_name} at {site_name} on {date}.",
    tokens: ["{user_name}", "{record_name}", "{site_name}", "{date}"],
    sample: { record_name: "GRN-318 — 12 T cement", site_name: "Whitefield Tower A" },
  },
  procurement_invoices: {
    title: "Vendor invoice — {record_name}",
    message: "{user_name} logged {record_name} on {date}.",
    tokens: ["{user_name}", "{record_name}", "{site_name}", "{date}"],
    sample: { record_name: "INV-7742 — Sri Balaji Traders", site_name: "Whitefield Tower A" },
  },
  vendors: {
    title: "Vendor — {record_name}",
    message: "{user_name} updated the vendor {record_name} on {date}.",
    tokens: ["{user_name}", "{record_name}", "{date}", "{module_name}"],
    sample: { record_name: "Sri Balaji Traders", site_name: "Whitefield Tower A" },
  },
  additional_expenses: {
    title: "Expense claim — {user_name}",
    message: "{user_name} submitted {record_name} for {site_name} on {date}.",
    tokens: ["{user_name}", "{record_name}", "{site_name}", "{date}"],
    sample: { record_name: "Site transport — ₹4,250", site_name: "Whitefield Tower A" },
  },
  leads: {
    title: "Lead — {record_name}",
    message: "{user_name} updated the lead {record_name} on {date}.",
    tokens: ["{user_name}", "{record_name}", "{date}", "{module_name}"],
    sample: { record_name: "Prestige Group — villa project", site_name: "Whitefield Tower A" },
  },
  customers: {
    title: "Customer — {record_name}",
    message: "{user_name} updated {record_name} on {date}.",
    tokens: ["{user_name}", "{record_name}", "{date}", "{module_name}"],
    sample: { record_name: "Anand Constructions", site_name: "Whitefield Tower A" },
  },
  customer_opportunities: {
    title: "Opportunity — {record_name}",
    message: "{user_name} updated {record_name} on {date}.",
    tokens: ["{user_name}", "{record_name}", "{date}", "{module_name}"],
    sample: { record_name: "Turnkey fit-out — Block C", site_name: "Whitefield Tower A" },
  },
  events: {
    title: "Event — {record_name}",
    message: "{user_name} scheduled {record_name} on {date}.",
    tokens: ["{user_name}", "{record_name}", "{date}", "{module_name}"],
    sample: { record_name: "Client walkthrough", site_name: "Whitefield Tower A" },
  },
  employees: {
    title: "Employee — {record_name}",
    message: "{user_name} updated the record for {record_name} on {date}.",
    tokens: ["{user_name}", "{record_name}", "{date}", "{module_name}"],
    sample: { record_name: "Ramesh Iyer — Site Engineer", site_name: "Whitefield Tower A" },
  },
};

const presetFor = (mod: string): ModulePreset => MODULE_PRESETS[mod] || DEFAULT_PRESET;

// Unknown tokens are deliberately left verbatim — notif_fill() does the same.
const renderTemplate = (tpl: string, ctx: Record<string, string>) =>
  (tpl || "").replace(/\{(\w+)\}/g, (_m, k) => (k in ctx ? ctx[k] : `{${k}}`));

export function NotificationRuleForm({ rule, userId, onClose, onSaved }: NotificationRuleFormProps) {
  const [name, setName] = useState(rule?.name || "");
  const [eventCode, setEventCode] = useState(rule?.event_code || "");
  const [sourceTables, setSourceTables] = useState<string[]>(rule?.source_table ? [rule.source_table] : []);
  const [receiverType, setReceiverType] = useState(rule?.receiver_type || "employee");
  const [receiverRole, setReceiverRole] = useState(rule?.receiver_role || "");
  const [receiverUserIds, setReceiverUserIds] = useState<string[]>(
    rule?.receiver_user_id ? [rule.receiver_user_id] : [],
  );
  const [notificationChannel, setChannel] = useState(rule?.notification_channel || "in_app");
  const [titleTemplate, setTitleTemplate] = useState(rule?.title_template || DEFAULT_PRESET.title);
  const [messageTemplate, setMessageTemplate] = useState(rule?.message_template || DEFAULT_PRESET.message);
  const [timezone, setTimezone] = useState(rule?.timezone || "Asia/Kolkata");
  const titleTouched = useRef(!!rule?.title_template);
  const messageTouched = useRef(!!rule?.message_template);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [moduleValue, setModuleValue] = useState(() => inferInitialModule(rule));
  const [subEventValues, setSubEventValues] = useState<string[]>(() => {
    const v = inferInitialSubEvent(rule, inferInitialModule(rule));
    return v ? [v] : [];
  });

  // Per-sub-event editable templates. Keyed by sub-event value.
  type TplState = { title: string; message: string; titleTouched: boolean; messageTouched: boolean };
  const [subEventTemplates, setSubEventTemplates] = useState<Record<string, TplState>>(() => {
    const initMod = inferInitialModule(rule);
    const initSub = inferInitialSubEvent(rule, initMod);
    if (rule && initSub) {
      return {
        [initSub]: {
          title: rule.title_template || DEFAULT_PRESET.title,
          message: rule.message_template || DEFAULT_PRESET.message,
          titleTouched: true,
          messageTouched: true,
        },
      };
    }
    return {};
  });
  const [activeSubEvent, setActiveSubEvent] = useState<string>(() =>
    inferInitialSubEvent(rule, inferInitialModule(rule)),
  );

  const isEdit = !!rule;
  const isCuratedModule = !!MODULE_SUB_EVENTS[moduleValue];
  const currentSubEvents = MODULE_SUB_EVENTS[moduleValue] || [];
  const activeSubEventObj = currentSubEvents.find((s) => s.value === activeSubEvent);
  const previewModule = isCuratedModule ? activeSubEventObj?.source_table || moduleValue : sourceTables[0] || "";
  const preset = useMemo(() => presetFor(previewModule), [previewModule]);
  const previewModuleLabel =
    SOURCE_TABLES.find((t) => t.value === previewModule)?.label ||
    MODULE_OPTIONS.find((m) => m.value === previewModule)?.label;

  // Keep subEventTemplates in sync with the selection: seed defaults on add, prune on remove.
  useEffect(() => {
    if (!isCuratedModule) return;
    setSubEventTemplates((prev) => {
      const next: Record<string, TplState> = {};
      for (const sv of subEventValues) {
        if (prev[sv]) {
          next[sv] = prev[sv];
        } else {
          const s = currentSubEvents.find((x) => x.value === sv);
          next[sv] = {
            title: s?.title || DEFAULT_PRESET.title,
            message: s?.message || DEFAULT_PRESET.message,
            titleTouched: false,
            messageTouched: false,
          };
        }
      }
      return next;
    });
    setActiveSubEvent((cur) => (subEventValues.includes(cur) ? cur : subEventValues[0] || ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCuratedModule, moduleValue, subEventValues.join("|")]);

  // Mirror the active sub-event into eventCode/sourceTables so the save payload
  // reflects the tab currently in view.
  useEffect(() => {
    if (!isCuratedModule || !activeSubEventObj) return;
    setEventCode(activeSubEventObj.event_code);
    setSourceTables([activeSubEventObj.source_table]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCuratedModule, activeSubEventObj?.value]);

  const activeTpl = isCuratedModule ? subEventTemplates[activeSubEvent] : undefined;
  const effectiveTitle = isCuratedModule ? activeTpl?.title ?? "" : titleTemplate;
  const effectiveMessage = isCuratedModule ? activeTpl?.message ?? "" : messageTemplate;
  const editingDisabled = isCuratedModule && !activeSubEvent;

  const updateActiveTitle = (val: string) => {
    if (isCuratedModule) {
      if (!activeSubEvent) return;
      setSubEventTemplates((prev) => ({
        ...prev,
        [activeSubEvent]: { ...prev[activeSubEvent], title: val, titleTouched: true },
      }));
    } else {
      titleTouched.current = true;
      setTitleTemplate(val);
    }
  };
  const updateActiveMessage = (val: string) => {
    if (isCuratedModule) {
      if (!activeSubEvent) return;
      setSubEventTemplates((prev) => ({
        ...prev,
        [activeSubEvent]: { ...prev[activeSubEvent], message: val, messageTouched: true },
      }));
    } else {
      messageTouched.current = true;
      setMessageTemplate(val);
    }
  };
  const appendToActiveTitle = (token: string) => updateActiveTitle(effectiveTitle + token);
  const appendToActiveMessage = (token: string) => updateActiveMessage(effectiveMessage + token);
  const resetActiveTemplates = () => {
    if (isCuratedModule && activeSubEventObj) {
      setSubEventTemplates((prev) => ({
        ...prev,
        [activeSubEvent]: {
          title: activeSubEventObj.title || DEFAULT_PRESET.title,
          message: activeSubEventObj.message || DEFAULT_PRESET.message,
          titleTouched: false,
          messageTouched: false,
        },
      }));
    } else {
      titleTouched.current = false;
      messageTouched.current = false;
      setTitleTemplate(preset.title);
      setMessageTemplate(preset.message);
    }
  };
  const activeTouched = isCuratedModule
    ? !!(activeTpl?.titleTouched || activeTpl?.messageTouched)
    : titleTouched.current || messageTouched.current;

  const {
    data: pickUsers = [],
    isLoading: pickUsersLoading,
    error: pickUsersError,
  } = useQuery({
    queryKey: ["notif-pick-users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("notif_pick_users" as any);
      if (error) throw error;
      return (data || []) as unknown as Array<{ id: string; name: string; role: string | null }>;
    },
  });

  const { data: eventTypes = [], error: eventTypesError } = useQuery({
    queryKey: ["notification-event-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_event_types" as any)
        .select("event_code, label")
        .eq("is_active", true)
        .order("event_code");
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  // Surface every load failure. An empty picker must never stand in for an error.
  useEffect(() => {
    if (pickUsersError) toast.error((pickUsersError as any).message || "Could not load the people list");
  }, [pickUsersError]);
  useEffect(() => {
    if (eventTypesError) toast.error((eventTypesError as any).message || "Could not load event types");
  }, [eventTypesError]);

  const handleSave = async () => {
    // Curated modules fan out one rule per selected sub-event. The fallback path
    // (editing a rule whose source_table is not a curated module) produces one
    // rule per selected source_table using the single picked event code.
    const variants: Array<{ event_code: string; source_table: string; label: string; title: string; message: string }> =
      isCuratedModule
        ? subEventValues
            .map((sv) => currentSubEvents.find((s) => s.value === sv))
            .filter((s): s is SubEvent => !!s)
            .map((s) => {
              const tpl = subEventTemplates[s.value];
              return {
                event_code: s.event_code,
                source_table: s.source_table,
                label: s.label,
                title: tpl?.title || s.title || DEFAULT_PRESET.title,
                message: tpl?.message || s.message || DEFAULT_PRESET.message,
              };
            })
        : sourceTables.map((mod) => ({
            event_code: eventCode,
            source_table: mod,
            label: SOURCE_TABLES.find((t) => t.value === mod)?.label || mod,
            title: titleTemplate,
            message: messageTemplate,
          }));

    if (variants.length === 0) {
      toast.error(
        isCuratedModule ? "Please pick at least one sub-event" : "Please pick an event and at least one module",
      );
      return;
    }
    if (variants.some((v) => !v.event_code || !v.source_table)) {
      toast.error("Please pick an event for this module");
      return;
    }
    if (variants.some((v) => !v.title.trim() || !v.message.trim())) {
      toast.error("Title and Message cannot be empty");
      return;
    }
    if (receiverType === "role" && !receiverRole) {
      toast.error("Please pick a role");
      return;
    }
    if (receiverType === "specific_user" && receiverUserIds.length === 0) {
      toast.error("Please pick at least one person");
      return;
    }

    setSaving(true);
    try {
      const receiverLabel = RECEIVER_OPTIONS.find((r) => r.value === receiverType)?.label || receiverType;
      // Guard the CHECK constraint: only in_app/push may ever reach the database.
      const safeChannel = SAVABLE_CHANNELS.has(notificationChannel) ? notificationChannel : "in_app";

      const commonPayload = {
        receiver_type: receiverType,
        receiver_role: receiverType === "role" ? receiverRole : null,
        notification_channel: safeChannel,
        timezone,
        updated_at: new Date().toISOString(),
      };

      // receiver_user_id holds a single uuid, so "specific people" fans out one rule per person.
      const targetUserIds: (string | null)[] =
        receiverType === "specific_user" && receiverUserIds.length > 0 ? receiverUserIds : [null];

      if (isEdit && rule) {
        // Edit updates the first variant + first user, keeping behaviour predictable.
        const v = variants[0];
        const payload = {
          ...commonPayload,
          event_code: v.event_code,
          source_table: v.source_table,
          title_template: v.title,
          message_template: v.message,
          receiver_user_id: receiverType === "specific_user" ? receiverUserIds[0] || null : null,
          // name is NOT NULL in the database — auto-generate when left blank.
          name: name.trim() || `When ${v.label} → notify ${receiverLabel}`,
        };
        const { error } = await supabase.from("notification_rules" as any).update(payload).eq("id", rule.id);
        if (error) throw error;
        toast.success("Rule updated");
      } else {
        const rows = variants.flatMap((v) =>
          targetUserIds.map((uid) => {
            const userLabel =
              uid && receiverType === "specific_user"
                ? pickUsers.find((u) => u.id === uid)?.name || "user"
                : receiverLabel;
            const multi = variants.length > 1 || targetUserIds.length > 1;
            return {
              ...commonPayload,
              event_code: v.event_code,
              source_table: v.source_table,
              title_template: v.title,
              message_template: v.message,
              receiver_user_id: uid,
              name: name.trim()
                ? multi
                  ? `${name.trim()} — ${v.label}${uid ? ` — ${userLabel}` : ""}`
                  : name.trim()
                : `When ${v.label} → notify ${uid ? userLabel : receiverLabel}`,
              created_by: userId || null,
            };
          }),
        );
        const { error } = await supabase.from("notification_rules" as any).insert(rows);
        if (error) throw error;
        toast.success(rows.length > 1 ? `Created ${rows.length} rules` : "Rule created");
      }
      onSaved();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save rule");
    } finally {
      setSaving(false);
    }
  };

  const tzDate = useMemo(() => formatDateInTz(timezone), [timezone]);
  // Sample context mirrors notif_fill(): the same five placeholders, nothing else.
  const sampleCtx: Record<string, string> = {
    user_name: "Ramesh Iyer",
    module_name: initcapModule(previewModule),
    record_name: preset.sample.record_name,
    site_name: preset.sample.site_name,
    date: tzDate,
  };
  const previewTitle = renderTemplate(effectiveTitle, sampleCtx);
  const previewMessage = renderTemplate(effectiveMessage, sampleCtx);

  // notify_send_test(p_title, p_message) writes one in-app notification to the
  // caller. It takes no event/module arguments, so the rendered preview is sent.
  const handleSendTest = async () => {
    if (!previewTitle.trim() || !previewMessage.trim()) {
      toast.error("Pick a module and sub-event first");
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.rpc("notify_send_test" as any, {
        p_title: `[TEST] ${previewTitle}`,
        p_message: previewMessage,
      });
      if (error) throw error;
      const result = (Array.isArray(data) ? data[0] : data) as any;
      // The function returns {ok:false, error:…} instead of raising for auth/role failures.
      if (result && result.ok === false) {
        toast.error(result.error || "Could not send the test notification");
        return;
      }
      toast.success("Test notification sent to you — check your bell.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to send test");
    } finally {
      setTesting(false);
    }
  };

  // Reusable pill classnames for the inline sentence-builder selects.
  const pillTrigger =
    "h-8 min-w-[160px] w-auto inline-flex bg-white border-sky-200 rounded-lg text-sm font-semibold text-slate-700 hover:border-sky-400 focus:ring-2 focus:ring-sky-400/30";

  return (
    <div className="w-full bg-white rounded-2xl shadow-lg shadow-sky-200/40 border border-sky-100 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-6 md:px-8 py-5 border-b border-sky-100 flex items-start justify-between bg-white">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            {isEdit ? "Edit notification rule" : "New notification rule"}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">Define how and when users receive automated alerts.</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="rounded-full h-9 w-9 p-0 text-slate-400 hover:text-slate-700"
        >
          <X size={18} />
        </Button>
      </div>

      <div className="p-6 md:p-8 space-y-8">
        {/* Logic Builder */}
        <section className="space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Logic Builder</div>
          <div className="p-4 md:p-5 bg-sky-50/60 rounded-xl border border-sky-200 flex flex-wrap items-center gap-x-3 gap-y-3 text-slate-700 leading-relaxed">
            <span className="font-medium">When something happens in module</span>
            <Select
              value={moduleValue}
              onValueChange={(v) => {
                setModuleValue(v);
                setSubEventValues([]);
                if (!MODULE_SUB_EVENTS[v]) {
                  setSourceTables([v]);
                } else {
                  setSourceTables([]);
                  setEventCode("");
                }
              }}
              disabled={isEdit}
            >
              <SelectTrigger className={pillTrigger}>
                <SelectValue placeholder="pick a module" />
              </SelectTrigger>
              <SelectContent>
                {MODULE_OPTIONS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isCuratedModule ? (
              <>
                <span className="font-medium">happens on</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={`${pillTrigger} justify-between`}>
                      <span className="truncate">
                        {subEventValues.length === 0
                          ? "pick sub-event(s)"
                          : subEventValues.length === 1
                            ? currentSubEvents.find((s) => s.value === subEventValues[0])?.label || "1 sub-event"
                            : `${subEventValues.length} sub-events`}
                      </span>
                      <ChevronDown size={14} className="opacity-60 ml-2" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 p-2">
                    <div className="text-xs text-muted-foreground px-2 pb-2">Select one or more triggers</div>
                    <div className="max-h-64 overflow-y-auto space-y-1">
                      {currentSubEvents.map((s) => {
                        const checked = subEventValues.includes(s.value);
                        return (
                          <label
                            key={s.value}
                            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-sky-50 cursor-pointer"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) =>
                                setSubEventValues((prev) =>
                                  v ? [...prev, s.value] : prev.filter((x) => x !== s.value),
                                )
                              }
                            />
                            <span className="text-sm text-slate-700">{s.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </>
            ) : moduleValue ? (
              <>
                <span className="font-medium">when</span>
                <Select value={eventCode} onValueChange={setEventCode}>
                  <SelectTrigger className={pillTrigger}>
                    <SelectValue placeholder="pick an event" />
                  </SelectTrigger>
                  <SelectContent>
                    {eventTypes.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        {eventTypesError ? "Could not load event types" : "No event types available"}
                      </div>
                    ) : (
                      eventTypes.map((et: any) => (
                        <SelectItem key={et.event_code} value={et.event_code}>
                          {et.label}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </>
            ) : null}

            <span className="font-medium">, notify</span>
            <Select value={receiverType} onValueChange={setReceiverType}>
              <SelectTrigger className={pillTrigger}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECEIVER_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {receiverType === "role" && (
              <Select value={receiverRole} onValueChange={setReceiverRole}>
                <SelectTrigger className={`${pillTrigger} min-w-[160px]`}>
                  <SelectValue placeholder="pick a role" />
                </SelectTrigger>
                <SelectContent>
                  {APP_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {receiverType === "specific_user" && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 min-w-[200px] justify-between font-semibold text-slate-700 bg-white border-sky-200 rounded-lg hover:border-sky-400"
                    disabled={pickUsersLoading}
                  >
                    <span className="truncate">
                      {pickUsersLoading
                        ? "Loading users…"
                        : receiverUserIds.length === 0
                          ? "pick people"
                          : receiverUserIds.length === 1
                            ? pickUsers.find((u) => u.id === receiverUserIds[0])?.name || "1 person"
                            : `${receiverUserIds.length} people`}
                    </span>
                    <ChevronDown size={14} className="opacity-60 ml-2" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-2">
                  <div className="text-xs text-muted-foreground px-2 pb-2">
                    Select one or more people — one rule per person will be created.
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {pickUsersError ? (
                      <div className="px-2 py-1.5 text-sm text-destructive">
                        Could not load people: {(pickUsersError as any).message}
                      </div>
                    ) : pickUsers.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        {pickUsersLoading ? "Loading…" : "No active users found"}
                      </div>
                    ) : (
                      pickUsers.map((u) => {
                        const checked = receiverUserIds.includes(u.id);
                        return (
                          <label
                            key={u.id}
                            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() =>
                                setReceiverUserIds((prev) =>
                                  prev.includes(u.id) ? prev.filter((x) => x !== u.id) : [...prev, u.id],
                                )
                              }
                            />
                            <div className="flex flex-col">
                              <span>{u.name}</span>
                              {u.role && <span className="text-xs text-muted-foreground">{u.role}</span>}
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            )}

            <span className="font-medium">via</span>
            <Select value={notificationChannel} onValueChange={setChannel}>
              <SelectTrigger className={pillTrigger}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNELS.map((c) => (
                  <SelectItem key={c.value} value={c.value} disabled={c.disabled}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <span className="font-medium">in</span>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className={`${pillTrigger} min-w-[220px]`} title="Timezone used for the {date} token">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>.</span>
          </div>

          {/* Who will receive this — live resolver */}
          <RecipientPreview
            receiverType={receiverType}
            receiverRole={receiverRole}
            receiverUserId={receiverUserIds[0] || ""}
            receiverUserIds={receiverUserIds}
            pickUsers={pickUsers}
            currentUserId={userId}
          />
        </section>

        {/* Two-column: form (left) + live preview (right) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
          {/* LEFT — content editor */}
          <div className="space-y-6">
            {/* Rule name */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">
                Rule name <span className="text-slate-400 font-normal">(optional)</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Auto-generated from the sentence above"
                className="bg-white border-sky-200 focus-visible:ring-sky-400/30 focus-visible:border-sky-400"
              />
              <p className="text-[11px] text-slate-500 flex items-start gap-1">
                <Info size={11} className="mt-0.5 flex-shrink-0 text-slate-400" />
                Leave blank to auto-generate a name from the sentence above. Only admins see this — the recipient sees
                Title/Message.
              </p>
            </div>

            {/* Sub-event tabs — one per selected "happens on" event */}
            {isCuratedModule && subEventValues.length > 0 && (
              <div className="border-b border-sky-100">
                <div className="flex flex-wrap items-end gap-1 -mb-px">
                  {subEventValues.map((sv) => {
                    const s = currentSubEvents.find((x) => x.value === sv);
                    const label = s?.label || sv;
                    const active = activeSubEvent === sv;
                    const edited = subEventTemplates[sv]?.titleTouched || subEventTemplates[sv]?.messageTouched;
                    return (
                      <button
                        key={sv}
                        type="button"
                        onClick={() => setActiveSubEvent(sv)}
                        className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                          active
                            ? "border-sky-500 text-slate-900"
                            : "border-transparent text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {label}
                        {edited && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" title="Edited" />}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  Each sub-event has its own Title and Message. Switch tabs to configure each one — one rule is created
                  per sub-event on save.
                </p>
              </div>
            )}

            {/* Module-aware banner */}
            <div className="rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2 text-[12px] text-slate-700 flex items-start gap-2">
              <Info size={13} className="mt-0.5 flex-shrink-0 text-slate-500" />
              {previewModule ? (
                <span>
                  {isCuratedModule && activeSubEventObj ? (
                    <>
                      Editing <span className="font-semibold">{activeSubEventObj.label}</span> — defaults tuned for{" "}
                      <span className="font-semibold">{previewModuleLabel}</span>.{" "}
                    </>
                  ) : (
                    <>
                      Showing suggested defaults for <span className="font-semibold">{previewModuleLabel}</span>.{" "}
                    </>
                  )}
                  Anything in{" "}
                  <code className="px-1 py-0.5 rounded bg-white border border-sky-200 text-slate-800">{"{curly}"}</code>{" "}
                  is replaced with real data at send time — click a token chip below or type your own text.
                </span>
              ) : (
                <span>Pick a module above to load recommended Title/Message defaults for that record type.</span>
              )}
              {activeTouched && previewModule && (
                <button
                  type="button"
                  className="ml-auto text-slate-700 font-medium hover:underline flex-shrink-0"
                  onClick={resetActiveTemplates}
                >
                  Reset
                </button>
              )}
            </div>

            {editingDisabled ? (
              <div className="rounded-lg border border-dashed border-sky-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                Pick at least one sub-event above to configure its Title and Message.
              </div>
            ) : (
              <>
                {/* Title */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-slate-700">
                      Title
                      {isCuratedModule && activeSubEventObj && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-sky-600 font-bold">
                          {activeSubEventObj.label}
                        </span>
                      )}
                    </Label>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                      Headline shown to recipient
                    </span>
                  </div>
                  <Input
                    value={effectiveTitle}
                    onChange={(e) => updateActiveTitle(e.target.value)}
                    className="font-medium text-slate-900 focus-visible:ring-sky-400/30 focus-visible:border-sky-500"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-[11px] text-slate-400 self-center mr-1">Insert:</span>
                    {preset.tokens.map((t) => (
                      <button
                        key={`t-${t}`}
                        type="button"
                        onClick={() => appendToActiveTitle(t)}
                        className="px-2 py-1 bg-sky-100 text-slate-700 rounded text-[11px] font-bold cursor-pointer hover:bg-slate-200 transition-colors"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-slate-700">
                      Message
                      {isCuratedModule && activeSubEventObj && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-sky-600 font-bold">
                          {activeSubEventObj.label}
                        </span>
                      )}
                    </Label>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                      Body of the notification
                    </span>
                  </div>
                  <Textarea
                    value={effectiveMessage}
                    onChange={(e) => updateActiveMessage(e.target.value)}
                    rows={4}
                    className="resize-none leading-relaxed focus-visible:ring-sky-400/30 focus-visible:border-sky-500"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-[11px] text-slate-400 self-center mr-1">Insert:</span>
                    {preset.tokens.map((t) => (
                      <button
                        key={`m-${t}`}
                        type="button"
                        onClick={() => appendToActiveMessage(t)}
                        className="px-2 py-1 bg-sky-100 text-slate-700 rounded text-[11px] font-bold cursor-pointer hover:bg-slate-200 transition-colors"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500 pt-1">
                    Supported placeholders: <code className="text-slate-600">{"{user_name}"}</code>,{" "}
                    <code className="text-slate-600">{"{module_name}"}</code>,{" "}
                    <code className="text-slate-600">{"{record_name}"}</code>,{" "}
                    <code className="text-slate-600">{"{site_name}"}</code>,{" "}
                    <code className="text-slate-600">{"{date}"}</code>. Anything else is sent as typed.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* RIGHT — live preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Live Preview
                {isCuratedModule && activeSubEventObj && (
                  <span className="ml-2 text-sky-600">· {activeSubEventObj.label}</span>
                )}
              </span>
              <span className="text-[10px] bg-sky-100 px-1.5 py-0.5 rounded text-slate-500 uppercase">
                In-app toast
              </span>
            </div>
            <div className="relative bg-sky-50/50 rounded-2xl p-6 border border-sky-100 flex items-center justify-center min-h-[240px]">
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.02]">
                <div className="w-32 h-32 border-4 border-sky-200 rounded-full" />
              </div>
              <div className="relative bg-white shadow-2xl shadow-sky-200/40 border border-sky-100 rounded-xl p-4 w-full max-w-[340px]">
                <div className="flex gap-3">
                  <div className="shrink-0 w-10 h-10 bg-sky-400 rounded-lg flex items-center justify-center text-white">
                    <Bell size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-bold text-slate-900 truncate">{previewTitle}</h4>
                      <span className="text-[9px] bg-sky-100 px-1.5 py-0.5 rounded text-slate-500 font-bold tracking-tight uppercase flex-shrink-0">
                        Test
                      </span>
                    </div>
                    <p className="text-[13px] text-slate-600 mt-1 leading-snug break-words">{previewMessage}</p>
                    <p className="text-[10px] text-slate-400 mt-2">
                      {formatDistanceToNow(new Date(), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-center text-slate-400 leading-relaxed">
              {previewModuleLabel ? (
                <>
                  Showing sample data for <span className="font-medium text-slate-500">{previewModuleLabel}</span>.
                  <br />
                </>
              ) : null}
              Tokens in <code className="text-slate-500">{"{curly}"}</code> are replaced with real data at send time.
            </p>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="px-6 md:px-8 py-5 bg-white border-t border-sky-100 flex items-center justify-between">
        <Button variant="ghost" onClick={onClose} className="text-slate-500 hover:text-slate-800">
          Cancel
        </Button>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleSendTest}
            disabled={testing}
            className="gap-1.5 bg-white border-sky-200 text-slate-700 hover:bg-sky-50 shadow-sm"
          >
            <Send size={14} /> {testing ? "Sending…" : "Send test to me"}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-sky-500 hover:bg-sky-600 text-white shadow-sm shadow-sky-200/60"
          >
            {(() => {
              if (saving) return "Saving…";
              if (isEdit) return "Update rule";
              const variantCount = isCuratedModule ? subEventValues.length : sourceTables.length;
              const userCount = receiverType === "specific_user" ? Math.max(receiverUserIds.length, 1) : 1;
              const total = variantCount * userCount;
              return total > 1 ? `Create ${total} rules` : "Create rule";
            })()}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// RecipientPreview — resolves who will actually receive the notification
// ============================================================
interface RecipientPreviewProps {
  receiverType: string;
  receiverRole: string;
  receiverUserId: string;
  receiverUserIds?: string[];
  pickUsers: Array<{ id: string; name: string; role: string | null }>;
  currentUserId: string;
}

function RecipientPreview({
  receiverType,
  receiverRole,
  receiverUserId,
  receiverUserIds,
  pickUsers,
  currentUserId,
}: RecipientPreviewProps) {
  const actorDependent = ["employee", "manager", "hierarchy"].includes(receiverType);
  const [sampleActor, setSampleActor] = useState<string>(currentUserId);

  useEffect(() => {
    if (!sampleActor && currentUserId) setSampleActor(currentUserId);
  }, [currentUserId, sampleActor]);

  const isMultiSpecific = receiverType === "specific_user" && (receiverUserIds?.length || 0) > 1;

  const { data, isLoading, error } = useQuery({
    queryKey: [
      "notif-preview-recipients",
      receiverType,
      receiverRole,
      receiverUserId,
      (receiverUserIds || []).join(","),
      actorDependent ? sampleActor : null,
    ],
    queryFn: async () => {
      // Multi-select "specific people" resolves locally from pickUsers — it avoids
      // N RPC calls and mirrors the fan-out that happens on save.
      if (isMultiSpecific) {
        return (receiverUserIds || [])
          .map((id) => pickUsers.find((u) => u.id === id))
          .filter((u): u is { id: string; name: string; role: string | null } => !!u);
      }
      const { data: rows, error: rpcError } = await supabase.rpc("notif_preview_recipients" as any, {
        p_receiver_type: receiverType,
        p_receiver_role: receiverRole || null,
        p_receiver_user_id: receiverUserId || null,
        p_sample_actor: actorDependent ? sampleActor || null : null,
      });
      if (rpcError) throw rpcError;
      return (rows || []) as unknown as Array<{ id: string; name: string; role: string | null }>;
    },
    enabled: !!receiverType && (!actorDependent || !!sampleActor),
  });

  // Surface the failure — a resolver error must never look like "nobody matches".
  useEffect(() => {
    if (error) toast.error((error as any).message || "Could not resolve recipients");
  }, [error]);

  const recipients = data || [];
  const count = recipients.length;
  const shown = recipients.slice(0, 3).map((r) => r.name).join(", ");
  const extra = count > 3 ? `, +${count - 3} more` : "";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-slate-600 font-medium">Who will receive this:</span>

      {actorDependent && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">preview as</span>
          <Select value={sampleActor} onValueChange={setSampleActor}>
            <SelectTrigger className="h-7 w-auto min-w-[140px] text-xs bg-white border-sky-300">
              <SelectValue placeholder="pick a person" />
            </SelectTrigger>
            <SelectContent>
              {pickUsers.map((u) => (
                <SelectItem key={u.id} value={u.id} className="text-xs">
                  {u.name}
                  {u.role ? ` · ${u.role}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {error ? (
        <span className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-full px-2 py-0.5">
          Could not resolve recipients: {(error as any).message}
        </span>
      ) : isLoading ? (
        <span className="text-xs text-slate-400">resolving…</span>
      ) : count === 0 ? (
        <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
          No one matches yet — pick a role or person.
        </span>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className="bg-sky-500 hover:bg-sky-600 text-xs">
            {count} {count === 1 ? "person" : "people"}
          </Badge>
          <span className="text-slate-700 text-xs">
            {shown}
            {extra}
          </span>
        </div>
      )}
    </div>
  );
}

export default NotificationRuleForm;
