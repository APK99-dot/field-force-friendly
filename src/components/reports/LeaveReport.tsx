import { useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, Timer, XCircle, Users, Sigma } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ReportShell } from "./ReportShell";
import { ReportChartCard } from "./ReportChartCard";
import { KpiGrid, ChartGrid, KpiItem } from "./KpiCards";
import { DateField, SelectField } from "./ReportFilters";
import { useReportScope } from "./useReportScope";
import { generateReportPdf } from "./reportPdf";

interface Row {
  id: string;
  user_id: string;
  full_name: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  total_days: number;
  status: string;
  approved_by_name: string;
}

const STATUS = [
  { value: "approved", label: "Approved" },
  { value: "pending", label: "Pending" },
  { value: "rejected", label: "Rejected" },
];

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };
  return <Badge className={map[s] || "bg-muted text-muted-foreground"}>{s}</Badge>;
};

export default function LeaveReport() {
  const scope = useReportScope();
  const [from, setFrom] = useState(format(new Date(), "yyyy-MM-01"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [employee, setEmployee] = useState("all");
  const [leaveType, setLeaveType] = useState("all");
  const [status, setStatus] = useState("all");
  const [types, setTypes] = useState<{ value: string; label: string }[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    supabase
      .from("leave_types")
      .select("id, name")
      .order("name")
      .then(({ data }) => setTypes((data || []).map((t) => ({ value: t.id, label: t.name }))));
  }, []);

  const generate = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("leave_applications")
        .select("id, user_id, leave_type_id, from_date, to_date, total_days, status, approved_by")
        .gte("from_date", from)
        .lte("from_date", to)
        .order("from_date", { ascending: false });
      if (employee !== "all") q = q.eq("user_id", employee);
      else if (scope.userIds) q = q.in("user_id", scope.userIds.length ? scope.userIds : ["00000000-0000-0000-0000-000000000000"]);
      if (leaveType !== "all") q = q.eq("leave_type_id", leaveType);
      if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;

      const approverIds = [...new Set((data || []).map((r) => r.approved_by).filter(Boolean))] as string[];
      const { data: approvers } = approverIds.length
        ? await supabase.from("users").select("id, full_name").in("id", approverIds)
        : { data: [] as { id: string; full_name: string }[] };
      const approverMap = new Map((approvers || []).map((a) => [a.id, a.full_name]));
      const nameMap = new Map(scope.users.map((u) => [u.id, u.full_name]));
      const typeMap = new Map(types.map((t) => [t.value, t.label]));

      setRows(
        (data || []).map((r) => ({
          id: r.id,
          user_id: r.user_id,
          full_name: nameMap.get(r.user_id) || "Unknown",
          leave_type: typeMap.get(r.leave_type_id) || "-",
          from_date: r.from_date,
          to_date: r.to_date,
          total_days: Number(r.total_days || 0),
          status: r.status,
          approved_by_name: r.approved_by ? approverMap.get(r.approved_by) || "-" : "-",
        }))
      );
      setGenerated(true);
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const kpis: KpiItem[] = useMemo(() => {
    const days = rows.reduce((s, r) => s + r.total_days, 0);
    const approved = rows.filter((r) => r.status === "approved").length;
    const pending = rows.filter((r) => r.status === "pending").length;
    const rejected = rows.filter((r) => r.status === "rejected").length;
    const rate = rows.length ? (approved / rows.length) * 100 : 0;
    const employees = new Set(rows.map((r) => r.user_id)).size;
    return [
      { label: "Applications", value: String(rows.length), icon: CalendarDays, tone: "primary" },
      { label: "Approved", value: String(approved), sub: `${rate.toFixed(1)}% rate`, icon: CheckCircle2, tone: "success" },
      { label: "Pending", value: String(pending), icon: Timer, tone: "warning" },
      { label: "Rejected", value: String(rejected), icon: XCircle, tone: "danger" },
      { label: "Total Days", value: String(days), icon: Sigma, tone: "info" },
      { label: "Employees", value: String(employees), icon: Users, tone: "muted" },
    ];
  }, [rows]);

  const byType = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.leave_type, (m.get(r.leave_type) || 0) + r.total_days));
    return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [rows]);

  const byEmployee = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.full_name, (m.get(r.full_name) || 0) + r.total_days));
    return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [rows]);

  const byMonth = useMemo(() => {
    const m = new Map<string, { Approved: number; Pending: number; Rejected: number }>();
    rows.forEach((r) => {
      const key = format(new Date(r.from_date), "MMM yyyy");
      const e = m.get(key) || { Approved: 0, Pending: 0, Rejected: 0 };
      if (r.status === "approved") e.Approved += r.total_days;
      else if (r.status === "pending") e.Pending += r.total_days;
      else if (r.status === "rejected") e.Rejected += r.total_days;
      m.set(key, e);
    });
    return Array.from(m.entries()).map(([name, v]) => ({ name, ...v }));
  }, [rows]);

  const statusDist = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.status, (m.get(r.status) || 0) + 1));
    return Array.from(m.entries()).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }));
  }, [rows]);

  const download = async () => {
    setDownloading(true);
    try {
      await generateReportPdf({
        title: "Leave Report",
        fileName: `leave-report-${from}-to-${to}.pdf`,
        generatedBy: scope.generatedBy,
        filters: [
          `Period: ${from} to ${to}`,
          `Employee: ${employee === "all" ? "All" : scope.users.find((u) => u.id === employee)?.full_name || "-"}`,
          `Leave Type: ${leaveType === "all" ? "All" : types.find((t) => t.value === leaveType)?.label || "-"}`,
          `Status: ${status === "all" ? "All" : status}`,
        ],
        columns: [
          { header: "Employee", width: 2.5 },
          { header: "Leave Type", width: 2 },
          { header: "From", width: 1.6 },
          { header: "To", width: 1.6 },
          { header: "Days", width: 1, align: "right" },
          { header: "Status", width: 1.4 },
          { header: "Approved By", width: 2 },
        ],
        rows: rows.map((r) => [
          r.full_name,
          r.leave_type,
          format(new Date(r.from_date), "dd MMM yyyy"),
          format(new Date(r.to_date), "dd MMM yyyy"),
          String(r.total_days),
          r.status,
          r.approved_by_name,
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

  return (
    <ReportShell
      title="Leave Report"
      description="Applications, days consumed and approval trends by leave type."
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
          <SelectField label="Leave Type" value={leaveType} onChange={setLeaveType} allLabel="All Types" options={types} />
          <SelectField label="Status" value={status} onChange={setStatus} allLabel="All Statuses" options={STATUS} />
        </>
      }
      summary={<KpiGrid items={kpis} cols={6} />}
      chart={
        <div className="space-y-4">
          <ReportChartCard
            title="Leave Days by Month"
            description="Approved, Pending and Rejected days trend"
            type="stackedBar"
            data={byMonth}
            height={280}
            series={[
              { key: "Approved", label: "Approved", color: "hsl(160 64% 42%)" },
              { key: "Pending", label: "Pending", color: "hsl(35 90% 55%)" },
              { key: "Rejected", label: "Rejected", color: "hsl(0 75% 60%)" },
            ]}
          />
          <ChartGrid cols={2}>
            <ReportChartCard
              title="Days by Leave Type"
              description="Distribution of total days across leave types"
              type="hbar"
              data={byType}
              height={Math.max(260, byType.length * 32)}
            />
            <ReportChartCard
              title="Application Status"
              description="Share of applications by status"
              type="donut"
              data={statusDist}
              height={280}
            />
          </ChartGrid>
          <ReportChartCard
            title="Top Leave Consumers"
            description="Employees with highest leave days in range"
            type="hbar"
            data={byEmployee}
            height={Math.max(240, byEmployee.length * 30)}
          />
        </div>
      }
      table={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Leave Type</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead className="text-right">Days</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Approved By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.full_name}</TableCell>
                <TableCell>{r.leave_type}</TableCell>
                <TableCell>{format(new Date(r.from_date), "dd MMM yyyy")}</TableCell>
                <TableCell>{format(new Date(r.to_date), "dd MMM yyyy")}</TableCell>
                <TableCell className="text-right">{r.total_days}</TableCell>
                <TableCell>{statusBadge(r.status)}</TableCell>
                <TableCell>{r.approved_by_name}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    />
  );
}
