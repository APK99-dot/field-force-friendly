import { lazy, Suspense } from "react";
import { useParams, Navigate } from "react-router-dom";
import { getReportDef } from "@/components/reports/reportConfig";

const AttendanceReport = lazy(() => import("@/components/reports/AttendanceReport"));
const LeaveReport = lazy(() => import("@/components/reports/LeaveReport"));
const ExpenseReport = lazy(() => import("@/components/reports/ExpenseReport"));
const ActivityReport = lazy(() => import("@/components/reports/ActivityReport"));
const MilestoneReport = lazy(() => import("@/components/reports/MilestoneReport"));
const ProcurementReport = lazy(() => import("@/components/reports/ProcurementReport"));
const PaymentReport = lazy(() => import("@/components/reports/PaymentReport"));

const MAP: Record<string, React.ComponentType> = {
  attendance: AttendanceReport,
  leave: LeaveReport,
  expense: ExpenseReport,
  activity: ActivityReport,
  milestone: MilestoneReport,
  procurement: ProcurementReport,
  payment: PaymentReport,
};

function Fallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function ReportView() {
  const { type } = useParams();
  if (!type || !getReportDef(type)) return <Navigate to="/reports" replace />;
  const Component = MAP[type];
  return (
    <Suspense fallback={<Fallback />}>
      <Component />
    </Suspense>
  );
}
