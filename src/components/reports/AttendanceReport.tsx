import { useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ReportShell, SummaryCards } from "./ReportShell";
import { ReportChartCard } from "./ReportChartCard";
import { startOfWeek } from "date-fns";
import { DateField, SelectField } from "./ReportFilters";
import { useReportScope } from "./useReportScope";
import { useReportContext, DateRangePill } from "@/components/analytics/ReportContext";
import { generateReportPdf } from "./reportPdf";

interface Row {
  user_id: string;
  full_name: string;
  date: string;
  status: string;
  check_in_time: string | null;
  check_out_time: string | null;
  total_hours: number | null;
}

const STATUS = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "leave", label: "Leave" },
];

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    present: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    absent: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    late: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    leave: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  };
  return <Badge className={map[s] || "bg-muted text-muted-foreground"}>{s.replace(/_/g, " ")}</Badge>;
};

const t = (d: string | null) => (d ? format(new Date(d), "HH:mm") : "--");

export default function AttendanceReport() {
  const scope = useReportScope();
  const { from, to, setFrom, setTo } = useReportContext();
  const [employee, setEmployee] = useState("all");
  const [status, setStatus] = useState("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("attendance")
        .select("user_id, date, status, check_in_time, check_out_time, total_hours")
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: true });
      if (employee !== "all") q = q.eq("user_id", employee);
      else if (scope.userIds) q = q.in("user_id", scope.userIds.length ? scope.userIds : ["00000000-0000-0000-0000-000000000000"]);
      if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      const nameMap = new Map(scope.users.map((u) => [u.id, u.full_name]));
      setRows(
        (data || []).map((r) => ({ ...r, full_name: nameMap.get(r.user_id) || "Unknown" }))
      );
      setGenerated(true);
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => {
    const present = rows.filter((r) => r.status === "present" || r.status === "late").length;
    const absent = rows.filter((r) => r.status === "absent").length;
    const hrs = rows.filter((r) => r.total_hours != null);
    const avg = hrs.length ? hrs.reduce((s, r) => s + (r.total_hours || 0), 0) / hrs.length : 0;
    return [
      { label: "Total Records", value: String(rows.length) },
      { label: "Present Days", value: String(present) },
      { label: "Absent Days", value: String(absent) },
      { label: "Avg Hours / Day", value: avg.toFixed(2) },
    ];
  }, [rows]);

  const chartData = useMemo(() => {
    const weeks = new Map<string, { name: string; Present: number; Absent: number }>();
    rows.forEach((r) => {
      const wk = format(startOfWeek(new Date(r.date), { weekStartsOn: 1 }), "dd MMM");
      const e = weeks.get(wk) || { name: wk, Present: 0, Absent: 0 };
      if (r.status === "present" || r.status === "late") e.Present += 1;
      else if (r.status === "absent") e.Absent += 1;
      weeks.set(wk, e);
    });
    return Array.from(weeks.values());
  }, [rows]);

  const download = async () => {
    setDownloading(true);
    try {
      await generateReportPdf({
        title: "Attendance Report",
        fileName: `attendance-report-${from}-to-${to}.pdf`,
        generatedBy: scope.generatedBy,
        filters: [
          `Period: ${from} to ${to}`,
          `Employee: ${employee === "all" ? "All" : scope.users.find((u) => u.id === employee)?.full_name || "-"}`,
          `Status: ${status === "all" ? "All" : status}`,
        ],
        columns: [
          { header: "Employee", width: 3 },
          { header: "Date", width: 2 },
          { header: "Check In", width: 1.5 },
          { header: "Check Out", width: 1.5 },
          { header: "Hours", width: 1.2, align: "right" },
          { header: "Status", width: 1.6 },
        ],
        rows: rows.map((r) => [
          r.full_name,
          format(new Date(r.date), "dd MMM yyyy"),
          t(r.check_in_time),
          t(r.check_out_time),
          r.total_hours?.toFixed(2) || "--",
          r.status.replace(/_/g, " "),
        ]),
        summary: summary.map((s) => ({ label: s.label, value: s.value })),
      });
      toast.success("PDF downloaded");
    } catch {
      toast.error("Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <ReportShell
      title="Attendance Report"
      description="Check-in/out times, total hours and status per employee."
      loading={loading || scope.loading}
      downloading={downloading}
      generated={generated}
      recordCount={rows.length}
      onGenerate={generate}
      onDownload={download}
      filters={
        <>
          <DateField label="From Date" value={from} onChange={setFrom} />
          <DateField label="To Date" value={to} onChange={setTo} />
          <SelectField
            label="Employee"
            value={employee}
            onChange={setEmployee}
            allLabel="All Employees"
            options={scope.users.map((u) => ({ value: u.id, label: u.full_name }))}
          />
          <SelectField label="Status" value={status} onChange={setStatus} allLabel="All Statuses" options={STATUS} />
        </>
      }
      summary={<SummaryCards items={summary} />}
      chart={
        <ReportChartCard
          title="Present vs Absent per Week"
          description="Attendance distribution across the selected date range"
          type="groupedBar"
          data={chartData}
          series={[
            { key: "Present", label: "Present", color: "hsl(160 64% 42%)" },
            { key: "Absent", label: "Absent", color: "hsl(0 75% 60%)" },
          ]}
        />
      }
      table={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Check In</TableHead>
              <TableHead>Check Out</TableHead>
              <TableHead className="text-right">Hours</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{r.full_name}</TableCell>
                <TableCell>{format(new Date(r.date), "dd MMM yyyy")}</TableCell>
                <TableCell>{t(r.check_in_time)}</TableCell>
                <TableCell>{t(r.check_out_time)}</TableCell>
                <TableCell className="text-right">{r.total_hours?.toFixed(2) || "--"}</TableCell>
                <TableCell>{statusBadge(r.status)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    />
  );
}
