import {
  Clock,
  CalendarDays,
  Receipt,
  ClipboardList,
  Flag,
  ShoppingCart,
  Wallet,
  LucideIcon,
} from "lucide-react";

export interface ReportDef {
  type: string;
  name: string;
  description: string;
  icon: LucideIcon;
  color: string; // gradient classes
}

export const REPORTS: ReportDef[] = [
  {
    type: "attendance",
    name: "Attendance Report",
    description: "Check-in/out times, total hours and status per employee.",
    icon: Clock,
    color: "from-blue-500 to-blue-600",
  },
  {
    type: "leave",
    name: "Leave Report",
    description: "Leave applications with type, duration and approval status.",
    icon: CalendarDays,
    color: "from-purple-500 to-purple-600",
  },
  {
    type: "expense",
    name: "Expense Report",
    description: "Employee expenses by category with approval status.",
    icon: Receipt,
    color: "from-orange-500 to-orange-600",
  },
  {
    type: "activity",
    name: "Activity Report",
    description: "Site activities, milestones, hours logged and status.",
    icon: ClipboardList,
    color: "from-emerald-500 to-emerald-600",
  },
  {
    type: "milestone",
    name: "Milestone Report",
    description: "Planned vs actual dates, progress and delays by site.",
    icon: Flag,
    color: "from-amber-500 to-amber-600",
  },
  {
    type: "procurement",
    name: "Procurement Report",
    description: "Purchase orders, vendors, values and payment status.",
    icon: ShoppingCart,
    color: "from-rose-500 to-rose-600",
  },
  {
    type: "payment",
    name: "Payment Report",
    description: "Invoices, amounts paid, balance due and references.",
    icon: Wallet,
    color: "from-cyan-500 to-cyan-600",
  },
];

export function getReportDef(type: string | undefined): ReportDef | undefined {
  return REPORTS.find((r) => r.type === type);
}
