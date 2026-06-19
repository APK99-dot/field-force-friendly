// Shared constants and helpers for the Procurement module

export const PROC_STATUSES = [
  "Draft",
  "Submitted",
  "Approved",
  "PO Sent",
  "Partially Received",
  "Fully Received",
  "Invoice Pending",
  "Closed",
  "Rejected",
] as const;
export type ProcStatus = (typeof PROC_STATUSES)[number];

// Statuses a user is allowed to set directly on the PO form
export const USER_FORM_STATUSES: ProcStatus[] = ["Draft", "Submitted"];

export const UOM_OPTIONS = ["Nos", "Kg", "Ton", "Bags", "Sqft", "Rmt", "Set"] as const;

export const PAYMENT_TERMS = [
  "Immediate",
  "Net 15",
  "Net 30",
  "Net 60",
  "Against Delivery",
] as const;

export const GRN_STATUSES = [
  "Pending",
  "Partially Received",
  "Fully Received",
  "Rejected",
] as const;
export type GrnStatus = (typeof GRN_STATUSES)[number];

// The ordered lifecycle (excludes Rejected which is a terminal side-branch)
export const STATUS_FLOW: ProcStatus[] = [
  "Draft",
  "Submitted",
  "Approved",
  "PO Sent",
  "Partially Received",
  "Fully Received",
  "Invoice Pending",
  "Closed",
];

export interface Transition {
  to: ProcStatus;
  label: string;
  /** requires admin/manager approval rights */
  approver: boolean;
  variant?: "default" | "destructive" | "outline";
}

// Allowed button-driven transitions from a given status
export function allowedTransitions(status: string): Transition[] {
  switch (status) {
    case "Draft":
      return [{ to: "Submitted", label: "Submit for Approval", approver: false }];
    case "Submitted":
      return [
        { to: "Approved", label: "Approve", approver: true },
        { to: "Rejected", label: "Reject", approver: true, variant: "destructive" },
      ];
    case "Approved":
      return [{ to: "PO Sent", label: "Mark PO Sent to Vendor", approver: true }];
    case "PO Sent":
      // Receiving happens via GRN; no manual button (auto-driven). Allow cancel/reject.
      return [{ to: "Rejected", label: "Reject", approver: true, variant: "destructive" }];
    case "Partially Received":
    case "Fully Received":
      return [{ to: "Invoice Pending", label: "Move to Invoice Pending", approver: true }];
    case "Invoice Pending":
      return [{ to: "Closed", label: "Close PO", approver: true }];
    default:
      return [];
  }
}

export function statusColor(status: string) {
  switch (status) {
    case "Draft": return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
    case "Submitted": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "Approved": return "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400";
    case "PO Sent": return "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400";
    case "Partially Received": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    case "Fully Received": return "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400";
    case "Invoice Pending": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    case "Closed": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "Rejected": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "Cancelled": return "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400";
    default: return "bg-gray-100 text-gray-600";
  }
}

export const fmtAmt = (n: number) =>
  `₹${(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Determine PO status after a GRN receipt, based on total received vs ordered.
export function receiptDrivenStatus(
  totalOrdered: number,
  totalReceived: number,
  current: string
): ProcStatus | null {
  if (totalReceived <= 0) return null;
  if (totalReceived >= totalOrdered) return "Fully Received";
  return "Partially Received";
}
