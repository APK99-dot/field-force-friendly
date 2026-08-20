import { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { CalendarRange } from "lucide-react";

export type ReportTabKey =
  | "overview"
  | "attendance"
  | "procurement"
  | "activities"
  | "milestones"
  | "expenses"
  | "payments";

interface ReportContextValue {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  tab: ReportTabKey;
  setTab: (t: ReportTabKey) => void;
  /** When true, the Procurement tab should default to POs pending approval. */
  procurementPendingOnly: boolean;
  setProcurementPendingOnly: (v: boolean) => void;
  /** Navigate to the Procurement tab filtered to pending-approval POs. */
  goToPendingProcurement: () => void;
}

const TAB_KEYS = [
  "overview", "attendance", "procurement", "activities",
  "milestones", "expenses", "payments",
] as const satisfies readonly ReportTabKey[];

const ReportContext = createContext<ReportContextValue | null>(null);

export function ReportProvider({ children }: { children: ReactNode }) {
  const [from, setFrom] = useState(format(new Date(), "yyyy-MM-01"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [procurementPendingOnly, setProcurementPendingOnly] = useState(false);

  // The active tab lives in the URL rather than in state.
  //
  // Held only in React state, a report had no address: nothing could link to
  // "Reports > Payments", a refresh dropped you back on Overview, and a record
  // opened from a report row had nowhere to send you on close. Putting it in
  // searchParams makes each report addressable, which is what the row links
  // and their return navigation are built on.
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("tab");
  const tab: ReportTabKey = (TAB_KEYS as readonly string[]).includes(raw ?? "")
    ? (raw as ReportTabKey)
    : "overview";

  const setTab = useCallback((t: ReportTabKey) => {
    setSearchParams((prev) => {
      // replace: switching tabs is not a navigation someone wants to step back
      // through one at a time.
      prev.set("tab", t);
      return prev;
    }, { replace: true });
  }, [setSearchParams]);

  const goToPendingProcurement = () => {
    setProcurementPendingOnly(true);
    setTab("procurement");
  };

  return (
    <ReportContext.Provider
      value={{
        from,
        to,
        setFrom,
        setTo,
        tab,
        setTab,
        procurementPendingOnly,
        setProcurementPendingOnly,
        goToPendingProcurement,
      }}
    >
      {children}
    </ReportContext.Provider>
  );
}

export function useReportContext() {
  const ctx = useContext(ReportContext);
  if (!ctx) throw new Error("useReportContext must be used within ReportProvider");
  return ctx;
}

export function DateRangePill() {
  const { from, to } = useReportContext();
  const range = `${format(new Date(from), "dd MMM yyyy")} - ${format(new Date(to), "dd MMM yyyy")}`;
  return (
    <Badge variant="secondary" className="gap-1.5 font-medium">
      <CalendarRange className="h-3.5 w-3.5" />
      {range}
    </Badge>
  );
}
