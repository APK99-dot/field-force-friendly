import { useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ReportShell, SummaryCards } from "./ReportShell";
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
    approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
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
      else if (scope.userIds) q = q.in("user_id", scope.userIds.length ? scope.userIds : ["__none__"]);
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

  const summary = useMemo(() => {
    const days = rows.reduce((s, r) => s + r.total_days, 0);
    return [
      { label: "Total Applications", value: String(rows.length) },
      { label: "Approved", value: String(rows.filter((r) => r.status === "approved").length) },
      { label: "Pending", value: String(rows.filter((r) => r.status === "pending").length) },
      { label: "Total Days", value: String(days) },
    ];
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
        summary,
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
      description="Leave applications with type, duration and approval status."
      loading={loading}
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
      summary={<SummaryCards items={summary} />}
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
