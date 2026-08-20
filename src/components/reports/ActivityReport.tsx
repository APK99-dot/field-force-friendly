import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, eachDayOfInterval } from "date-fns";
import { toast } from "sonner";
import { Activity, CheckCircle2, Clock, ListChecks, MapPin, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ReportShell } from "./ReportShell";
import { ReportChartCard } from "./ReportChartCard";
import { KpiGrid, ChartGrid, KpiItem } from "./KpiCards";
import { DateField, SelectField } from "./ReportFilters";
import { useReportScope } from "./useReportScope";
import { useReportContext, DateRangePill } from "@/components/analytics/ReportContext";
import { generateReportPdf } from "./reportPdf";

interface Row {
  id: string;
  full_name: string;
  activity_date: string;
  site: string;
  milestone: string;
  activity_type: string;
  description: string;
  total_hours: number | null;
  status: string;
}

const STATUS = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    in_progress: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400",
    planned: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  };
  return <Badge className={map[s] || "bg-muted text-muted-foreground"}>{s.replace(/_/g, " ")}</Badge>;
};

export default function ActivityReport() {
  const scope = useReportScope();
  const { from, to, setFrom, setTo } = useReportContext();
  const [employee, setEmployee] = useState("all");
  const [site, setSite] = useState("all");
  const [milestone, setMilestone] = useState("all");
  const [actType, setActType] = useState("all");
  const [sites, setSites] = useState<{ value: string; label: string }[]>([]);
  const [milestones, setMilestones] = useState<{ value: string; label: string; site_id: string }[]>([]);
  const [actTypes, setActTypes] = useState<{ value: string; label: string }[]>([]);
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    supabase
      .from("project_sites")
      .select("id, site_name")
      .eq("is_active", true)
      .order("site_name")
      .then(({ data }) => setSites((data || []).map((s) => ({ value: s.id, label: s.site_name }))));
    supabase
      .from("site_milestones")
      .select("id, name, site_id")
      .order("name")
      .then(({ data }) =>
        setMilestones((data || []).map((m) => ({ value: m.id, label: m.name, site_id: m.site_id })))
      );
    supabase
      .from("activity_types_master")
      .select("name")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setActTypes((data || []).map((a) => ({ value: a.name, label: a.name }))));
  }, []);

  const milestoneOptions = useMemo(
    () => (site === "all" ? milestones : milestones.filter((m) => m.site_id === site)),
    [milestones, site]
  );

  const generate = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("activity_events")
        .select("id, user_id, activity_date, site_id, milestone_id, activity_type, description, total_hours, status")
        .gte("activity_date", from)
        .lte("activity_date", to)
        .order("activity_date", { ascending: false });
      if (employee !== "all") q = q.eq("user_id", employee);
      else if (scope.userIds) q = q.in("user_id", scope.userIds.length ? scope.userIds : ["00000000-0000-0000-0000-000000000000"]);
      if (site !== "all") q = q.eq("site_id", site);
      if (milestone !== "all") q = q.eq("milestone_id", milestone);
      if (actType !== "all") q = q.eq("activity_type", actType);
      const { data, error } = await q;
      if (error) throw error;
      const nameMap = new Map(scope.users.map((u) => [u.id, u.full_name]));
      const siteMap = new Map(sites.map((s) => [s.value, s.label]));
      const msMap = new Map(milestones.map((m) => [m.value, m.label]));
      setRows(
        (data || []).map((r) => ({
          id: r.id,
          full_name: nameMap.get(r.user_id) || "Unknown",
          activity_date: r.activity_date,
          site: r.site_id ? siteMap.get(r.site_id) || "-" : "-",
          milestone: r.milestone_id ? msMap.get(r.milestone_id) || "-" : "-",
          activity_type: r.activity_type || "-",
          description: r.description || "-",
          total_hours: r.total_hours,
          status: r.status,
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
    const completed = rows.filter((r) => r.status === "completed").length;
    const inProgress = rows.filter((r) => r.status === "in_progress").length;
    const planned = rows.filter((r) => r.status === "planned").length;
    const hours = rows.reduce((s, r) => s + (r.total_hours || 0), 0);
    const activeUsers = new Set(rows.map((r) => r.full_name)).size;
    const activeSites = new Set(rows.map((r) => r.site).filter((s) => s !== "-")).size;
    const completionPct = rows.length ? (completed / rows.length) * 100 : 0;
    const avgHrs = rows.length ? hours / rows.length : 0;
    return [
      { label: "Total Activities", value: String(rows.length), icon: ListChecks, tone: "primary" },
      { label: "Completed", value: String(completed), sub: `${completionPct.toFixed(1)}% completion`, icon: CheckCircle2, tone: "success" },
      { label: "In Progress", value: String(inProgress), icon: Activity, tone: "info" },
      { label: "Planned", value: String(planned), icon: Timer, tone: "warning" },
      { label: "Total Hours", value: `${hours.toFixed(1)}h`, sub: `${avgHrs.toFixed(2)}h / activity`, icon: Clock, tone: "info" },
      { label: "Active Sites", value: String(activeSites), sub: `${activeUsers} users`, icon: MapPin, tone: "muted" },
    ];
  }, [rows]);

  const dailyTrend = useMemo(() => {
    if (!from || !to || !rows.length) return [];
    const days = eachDayOfInterval({ start: parseISO(from), end: parseISO(to) });
    const map = new Map<string, { Completed: number; "In Progress": number; Planned: number }>();
    days.forEach((d) => map.set(format(d, "yyyy-MM-dd"), { Completed: 0, "In Progress": 0, Planned: 0 }));
    rows.forEach((r) => {
      const e = map.get(r.activity_date);
      if (!e) return;
      if (r.status === "completed") e.Completed += 1;
      else if (r.status === "in_progress") e["In Progress"] += 1;
      else if (r.status === "planned") e.Planned += 1;
    });
    return Array.from(map.entries()).map(([k, v]) => ({ name: format(parseISO(k), "dd MMM"), ...v }));
  }, [rows, from, to]);

  const byType = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.activity_type, (m.get(r.activity_type) || 0) + 1));
    return Array.from(m.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [rows]);

  const bySite = useMemo(() => {
    type A = { count: number; hours: number };
    const m = new Map<string, A>();
    rows.forEach((r) => {
      const e = m.get(r.site) || { count: 0, hours: 0 };
      e.count += 1;
      e.hours += r.total_hours || 0;
      m.set(r.site, e);
    });
    return Array.from(m.entries())
      .map(([name, v]) => ({ name, Activities: v.count, Hours: +v.hours.toFixed(1) }))
      .sort((a, b) => b.Activities - a.Activities)
      .slice(0, 10);
  }, [rows]);

  const byEmployee = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.full_name, (m.get(r.full_name) || 0) + 1));
    return Array.from(m.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [rows]);

  const download = async () => {
    setDownloading(true);
    try {
      await generateReportPdf({
        title: "Activity Report",
        fileName: `activity-report-${from}-to-${to}.pdf`,
        generatedBy: scope.generatedBy,
        filters: [
          `Period: ${from} to ${to}`,
          `Employee: ${employee === "all" ? "All" : scope.users.find((u) => u.id === employee)?.full_name || "-"}`,
          `Site: ${site === "all" ? "All" : sites.find((s) => s.value === site)?.label || "-"}`,
          `Milestone: ${milestone === "all" ? "All" : milestones.find((m) => m.value === milestone)?.label || "-"}`,
          `Activity Type: ${actType === "all" ? "All" : actType}`,
        ],
        columns: [
          { header: "Date", width: 1.6 },
          { header: "Employee", width: 2 },
          { header: "Site", width: 2 },
          { header: "Milestone", width: 2 },
          { header: "Activity Type", width: 2 },
          { header: "Description", width: 3 },
          { header: "Hours", width: 1, align: "right" },
          { header: "Status", width: 1.4 },
        ],
        rows: rows.map((r) => [
          format(new Date(r.activity_date), "dd MMM yyyy"),
          r.full_name,
          r.site,
          r.milestone,
          r.activity_type,
          r.description,
          r.total_hours?.toFixed(1) || "--",
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

  return (
    <ReportShell
      title="Activity Report"
      description="Site activities, milestones, hours logged and status trends."
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
          <SelectField
            label="Site / Project"
            value={site}
            onChange={(v) => {
              setSite(v);
              setMilestone("all");
            }}
            allLabel="All Sites"
            options={sites}
          />
          <SelectField label="Milestone" value={milestone} onChange={setMilestone} allLabel="All Milestones" options={milestoneOptions} />
          <SelectField label="Activity Type" value={actType} onChange={setActType} allLabel="All Types" options={actTypes} />
        </>
      }
      summary={<KpiGrid items={kpis} cols={6} />}
      chart={
        <div className="space-y-4">
          <ReportChartCard
            title="Daily Activity Trend"
            description="Completed vs In Progress vs Planned activities per day"
            type="stackedBar"
            data={dailyTrend}
            height={280}
            series={[
              { key: "Completed", label: "Completed", color: "hsl(160 64% 42%)" },
              { key: "In Progress", label: "In Progress", color: "hsl(217 80% 58%)" },
              { key: "Planned", label: "Planned", color: "hsl(35 90% 55%)" },
            ]}
          />
          <ChartGrid cols={2}>
            <ReportChartCard
              title="Activities by Type"
              description="Top activity categories"
              type="hbar"
              data={byType}
              height={Math.max(260, byType.length * 30)}
            />
            <ReportChartCard
              title="Activities by Site"
              description="Volume and hours per site"
              type="groupedBar"
              data={bySite}
              height={Math.max(260, bySite.length * 34)}
              series={[
                { key: "Activities", label: "Activities", color: "hsl(217 80% 58%)" },
                { key: "Hours", label: "Hours", color: "hsl(160 64% 42%)" },
              ]}
            />
          </ChartGrid>
          <ReportChartCard
            title="Top Contributors"
            description="Employees with most activities in range"
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
              <TableHead>Date</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Site</TableHead>
              <TableHead>Milestone</TableHead>
              <TableHead>Activity Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Hours</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              // Activities reads ?id= and opens that record; from= brings the
              // user back to this report when they close it.
              <TableRow
                key={r.id}
                onClick={() => navigate(`/activities?id=${r.id}&from=${encodeURIComponent("/analytics?tab=activities")}`)}
                className="cursor-pointer hover:bg-muted/50"
              >
                <TableCell>{format(new Date(r.activity_date), "dd MMM yyyy")}</TableCell>
                <TableCell className="font-medium">{r.full_name}</TableCell>
                <TableCell>{r.site}</TableCell>
                <TableCell>{r.milestone}</TableCell>
                <TableCell>{r.activity_type}</TableCell>
                <TableCell className="max-w-[220px] truncate">{r.description}</TableCell>
                <TableCell className="text-right">{r.total_hours?.toFixed(1) || "--"}</TableCell>
                <TableCell>{statusBadge(r.status)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    />
  );
}
