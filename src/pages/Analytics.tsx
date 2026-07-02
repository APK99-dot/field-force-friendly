import { lazy, Suspense } from "react";
import { motion } from "framer-motion";
import { BarChart3 } from "lucide-react";
import { OverviewTab } from "@/components/analytics/OverviewTab";
import { ReportProvider, useReportContext, ReportTabKey } from "@/components/analytics/ReportContext";
import { useModuleConfig } from "@/hooks/useModuleConfig";

const AttendanceReport = lazy(() => import("@/components/reports/AttendanceReport"));
const ProcurementReport = lazy(() => import("@/components/reports/ProcurementReport"));
const ActivityReport = lazy(() => import("@/components/reports/ActivityReport"));
const MilestoneReport = lazy(() => import("@/components/reports/MilestoneReport"));
const ExpenseReport = lazy(() => import("@/components/reports/ExpenseReport"));
const PaymentReport = lazy(() => import("@/components/reports/PaymentReport"));

const TABS: { key: ReportTabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "attendance", label: "Attendance" },
  { key: "procurement", label: "Procurement" },
  { key: "activities", label: "Activities" },
  { key: "milestones", label: "Milestones" },
  { key: "expenses", label: "Expenses" },
  { key: "payments", label: "Payments" },
];

function Fallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function AnalyticsInner() {
  const { tab, setTab } = useReportContext();
  const reportsCfg = useModuleConfig("reports");
  const reportEnabled: Record<string, string> = {
    attendance: "attendanceReport",
    procurement: "procurementReport",
    activities: "activityReport",
    expenses: "expenseReport",
  };
  const visibleTabs = TABS.filter((t) => !reportEnabled[t.key] || reportsCfg.bool(reportEnabled[t.key]));

  return (
    <div className="pb-24">
      <div className="gradient-hero text-primary-foreground p-5 rounded-b-2xl">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Analytics</h1>
            <p className="text-xs opacity-80">Module insights, charts and downloadable reports</p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto overflow-x-auto no-scrollbar">
          <div className="flex gap-1 px-3 py-2 min-w-max">
            {visibleTabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  tab === t.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {tab === "overview" && <OverviewTab />}
          <Suspense fallback={<Fallback />}>
            {tab === "attendance" && <AttendanceReport />}
            {tab === "procurement" && <ProcurementReport />}
            {tab === "activities" && <ActivityReport />}
            {tab === "milestones" && <MilestoneReport />}
            {tab === "expenses" && <ExpenseReport />}
            {tab === "payments" && <PaymentReport />}
          </Suspense>
        </motion.div>
      </div>
    </div>
  );
}

export default function Analytics() {
  return (
    <ReportProvider>
      <AnalyticsInner />
    </ReportProvider>
  );
}
