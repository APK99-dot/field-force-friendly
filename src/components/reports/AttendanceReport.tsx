import { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, eachDayOfInterval, parseISO, differenceInCalendarDays } from "date-fns";
import { toast } from "sonner";
import {
  CalendarCheck,
  UserCheck,
  UserX,
  Clock,
  AlarmClockOff,
  LogOut,
  CalendarOff,
  Percent,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ReportShell } from "./ReportShell";
import { ReportChartCard } from "./ReportChartCard";
import { KpiGrid, ChartGrid, KpiItem } from "./KpiCards";
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

// Business thresholds — used only when explicit status is missing
const STANDARD_START_MIN = 9 * 60 + 30; // 09:30 grace
const STANDARD_END_MIN = 18 * 60;       // 18:00 close
const STANDARD_HOURS = 8;

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    present: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    absent: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    late: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    leave: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400",
  };
  return <Badge className={map[s] || "bg-muted text-muted-foreground"}>{s.replace(/_/g, " ")}</Badge>;
};

const t = (d: string | null) => (d ? format(new Date(d), "HH:mm") : "--");

const minutesOf = (d: string | null) => {
  if (!d) return null;
  const dt = new Date(d);
  return dt.getHours() * 60 + dt.getMinutes();
};

export default function AttendanceReport() {
  const scope = useReportScope();
  const { from, to, setFrom, setTo } = useReportContext();
  const [employee, setEmployee] = useState("all");
  const [status, setStatus] = useState("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [regularizedCount, setRegularizedCount] = useState(0);
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

      // Regularizations approved within date range (for KPI)
      let rq = supabase
        .from("regularization_requests")
        .select("id, user_id, status, date")
        .gte("date", from)
        .lte("date", to)
        .eq("status", "approved");
      if (employee !== "all") rq = rq.eq("user_id", employee);
      else if (scope.userIds) rq = rq.in("user_id", scope.userIds.length ? scope.userIds : ["00000000-0000-0000-0000-000000000000"]);
      const { data: regs } = await rq;
      setRegularizedCount((regs || []).length);

      setGenerated(true);
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const derived = useMemo(() => {
    let lateCount = 0;
    let earlyOut = 0;
    let overtimeHours = 0;
    let workedHours = 0;
    let workedRecords = 0;

    rows.forEach((r) => {
      const inMin = minutesOf(r.check_in_time);
      const outMin = minutesOf(r.check_out_time);
      const isLate = r.status === "late" || (inMin != null && inMin > STANDARD_START_MIN);
      const isWorked = r.status === "present" || r.status === "late" || (inMin != null);
      if (isWorked && isLate) lateCount += 1;
      if (isWorked && outMin != null && outMin < STANDARD_END_MIN) earlyOut += 1;
      if (r.total_hours != null && isWorked) {
        workedHours += r.total_hours;
        workedRecords += 1;
        if (r.total_hours > STANDARD_HOURS) overtimeHours += r.total_hours - STANDARD_HOURS;
      }
    });

    return {
      lateCount,
      earlyOut,
      overtimeHours,
      avgHours: workedRecords ? workedHours / workedRecords : 0,
      totalWorkedHours: workedHours,
    };
  }, [rows]);

  const kpis: KpiItem[] = useMemo(() => {
    const present = rows.filter((r) => r.status === "present" || r.status === "late").length;
    const absent = rows.filter((r) => r.status === "absent").length;
    const leaves = rows.filter((r) => r.status === "leave").length;
    const total = rows.length || 1;
    const attendancePct = (present / total) * 100;
    return [
      { label: "Attendance %", value: `${attendancePct.toFixed(1)}%`, sub: `${present}/${rows.length} records`, icon: Percent, tone: "primary" },
      { label: "Present", value: String(present), icon: UserCheck, tone: "success" },
      { label: "Absent", value: String(absent), icon: UserX, tone: "danger" },
      { label: "Leaves", value: String(leaves), icon: CalendarOff, tone: "info" },
      { label: "Late Check-ins", value: String(derived.lateCount), icon: AlarmClockOff, tone: "warning" },
      { label: "Early Check-outs", value: String(derived.earlyOut), icon: LogOut, tone: "warning" },
      { label: "Avg Working Hours", value: `${derived.avgHours.toFixed(2)}h`, sub: `${derived.totalWorkedHours.toFixed(1)}h total`, icon: Clock, tone: "info" },
      { label: "Regularizations", value: String(regularizedCount), sub: "Approved in range", icon: CalendarCheck, tone: "muted" },
    ];
  }, [rows, derived, regularizedCount]);

  // Daily stacked-bar trend (Present, Late, Absent, Leave)
  const dailyTrend = useMemo(() => {
    if (!from || !to) return [];
    const days = eachDayOfInterval({ start: parseISO(from), end: parseISO(to) });
    const map = new Map<string, { Present: number; Late: number; Absent: number; Leave: number }>();
    days.forEach((d) => map.set(format(d, "yyyy-MM-dd"), { Present: 0, Late: 0, Absent: 0, Leave: 0 }));
    rows.forEach((r) => {
      const e = map.get(r.date);
      if (!e) return;
      if (r.status === "present") e.Present += 1;
      else if (r.status === "late") e.Late += 1;
      else if (r.status === "absent") e.Absent += 1;
      else if (r.status === "leave") e.Leave += 1;
    });
    // downsample name labels for long ranges
    const span = differenceInCalendarDays(parseISO(to), parseISO(from));
    const fmt = span > 45 ? "dd MMM" : "dd MMM";
    return Array.from(map.entries()).map(([k, v]) => ({
      name: format(parseISO(k), fmt),
      ...v,
    }));
  }, [rows, from, to]);

  // Employee-wise Attendance %
  const employeeChart = useMemo(() => {
    type Agg = { present: number; total: number; hours: number };
    const m = new Map<string, Agg>();
    rows.forEach((r) => {
      const e = m.get(r.full_name) || { present: 0, total: 0, hours: 0 };
      e.total += 1;
      if (r.status === "present" || r.status === "late") e.present += 1;
      if (r.total_hours) e.hours += r.total_hours;
      m.set(r.full_name, e);
    });
    return Array.from(m.entries())
      .map(([name, v]) => ({ name, value: v.total ? +((v.present / v.total) * 100).toFixed(1) : 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }, [rows]);

  const statusChart = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.status, (m.get(r.status) || 0) + 1));
    return Array.from(m.entries()).map(([k, value]) => ({
      name: k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " "),
      value,
    }));
  }, [rows]);

  const hoursTrend = useMemo(() => {
    const m = new Map<string, { sum: number; count: number }>();
    rows.forEach((r) => {
      if (!r.total_hours) return;
      const e = m.get(r.date) || { sum: 0, count: 0 };
      e.sum += r.total_hours;
      e.count += 1;
      m.set(r.date, e);
    });
    return Array.from(m.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({
        name: format(parseISO(k), "dd MMM"),
        Hours: +(v.sum / v.count).toFixed(2),
      }));
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
        summary: kpis.map((k) => ({ label: k.label, value: k.value })),
      });
      toast.success("PDF downloaded");
    } catch {
      toast.error("Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  };

  const donutCenter = useMemo(() => {
    const present = rows.filter((r) => r.status === "present" || r.status === "late").length;
    const total = rows.length || 1;
    return { value: `${((present / total) * 100).toFixed(0)}%`, label: "Attendance" };
  }, [rows]);

  return (
    <ReportShell
      title="Attendance Report"
      description="Daily trends, employee-level attendance % and productivity KPIs."
      pill={<DateRangePill />}
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
      summary={<KpiGrid items={kpis} />}
      chart={
        <div className="space-y-4">
          <ReportChartCard
            title="Daily Attendance Trend"
            description="Present, Late, Absent and Leave distribution per day"
            type="stackedBar"
            data={dailyTrend}
            height={300}
            series={[
              { key: "Present", label: "Present", color: "hsl(160 64% 42%)" },
              { key: "Late", label: "Late", color: "hsl(35 90% 55%)" },
              { key: "Absent", label: "Absent", color: "hsl(0 75% 60%)" },
              { key: "Leave", label: "Leave", color: "hsl(217 80% 58%)" },
            ]}
          />
          <ChartGrid cols={2}>
            <ReportChartCard
              title="Employee-wise Attendance %"
              description="Top employees by attendance percentage"
              type="hbar"
              data={employeeChart}
              height={Math.max(260, employeeChart.length * 30)}
              formatValue={(v) => `${v}%`}
            />
            <div className="space-y-4">
              <ReportChartCard
                title="Status Distribution"
                description="Share of attendance statuses in range"
                type="donut"
                data={statusChart}
                height={280}
                centerLabel={donutCenter}
              />
              <ReportChartCard
                title="Average Working Hours Trend"
                description="Daily average hours worked"
                type="area"
                data={hoursTrend}
                height={220}
                formatValue={(v) => `${v}h`}
                series={[{ key: "Hours", label: "Avg Hours", color: "hsl(217 80% 58%)" }]}
              />
            </div>
          </ChartGrid>
        </div>
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
