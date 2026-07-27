import { useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Flag, CheckCircle2, AlertTriangle, Timer, TrendingUp, MapPin } from "lucide-react";
import { ReportShell } from "./ReportShell";
import { ReportChartCard } from "./ReportChartCard";
import { KpiGrid, ChartGrid, KpiItem } from "./KpiCards";
import { DateField, SelectField } from "./ReportFilters";
import { useReportScope } from "./useReportScope";
import { useReportContext, DateRangePill } from "@/components/analytics/ReportContext";
import { generateReportPdf } from "./reportPdf";

interface Row {
  id: string;
  site: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  percent_complete: number;
  status: string;
  delayed: boolean;
}

const STATUS = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

const d = (x: string | null) => (x ? format(new Date(x), "dd MMM yyyy") : "--");

export default function MilestoneReport() {
  const scope = useReportScope();
  const { from, to, setFrom, setTo } = useReportContext();
  const [site, setSite] = useState("all");
  const [status, setStatus] = useState("all");
  const [sites, setSites] = useState<{ value: string; label: string }[]>([]);
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
  }, []);

  const generate = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("site_milestones")
        .select("id, site_id, name, start_date, end_date, status, actual_start_date, actual_end_date, percent_complete")
        .order("start_date", { ascending: true });
      if (site !== "all") q = q.eq("site_id", site);
      if (status !== "all") q = q.eq("status", status);
      if (from) q = q.gte("start_date", from);
      if (to) q = q.lte("start_date", to);
      const { data, error } = await q;
      if (error) throw error;
      const siteMap = new Map(sites.map((s) => [s.value, s.label]));
      const today = format(new Date(), "yyyy-MM-dd");
      setRows(
        (data || []).map((m) => {
          const completed = m.status === "completed";
          const overEnd =
            (!!m.end_date && !completed && m.end_date < today) ||
            (!!m.end_date && !!m.actual_end_date && m.actual_end_date > m.end_date);
          return {
            id: m.id,
            site: m.site_id ? siteMap.get(m.site_id) || "-" : "-",
            name: m.name,
            start_date: m.start_date,
            end_date: m.end_date,
            actual_start_date: m.actual_start_date,
            actual_end_date: m.actual_end_date,
            percent_complete: Number(m.percent_complete || 0),
            status: m.status,
            delayed: overEnd,
          };
        })
      );
      setGenerated(true);
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const kpis: KpiItem[] = useMemo(() => {
    const delayed = rows.filter((r) => r.delayed).length;
    const completed = rows.filter((r) => r.status === "completed").length;
    const inProgress = rows.filter((r) => r.status === "in_progress").length;
    const avgProgress = rows.length ? rows.reduce((s, r) => s + r.percent_complete, 0) / rows.length : 0;
    const sites = new Set(rows.map((r) => r.site)).size;
    return [
      { label: "Total Milestones", value: String(rows.length), icon: Flag, tone: "primary" },
      { label: "Completed", value: String(completed), icon: CheckCircle2, tone: "success" },
      { label: "In Progress", value: String(inProgress), icon: Timer, tone: "info" },
      { label: "Delayed", value: String(delayed), icon: AlertTriangle, tone: "danger" },
      { label: "Avg Progress", value: `${avgProgress.toFixed(1)}%`, icon: TrendingUp, tone: "warning" },
      { label: "Sites", value: String(sites), icon: MapPin, tone: "muted" },
    ];
  }, [rows]);

  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        name: r.name.length > 22 ? `${r.name.slice(0, 22)}…` : r.name,
        value: r.percent_complete,
      })),
    [rows]
  );

  const statusChart = useMemo(() => {
    const labelFor = (r: Row) => {
      if (r.delayed) return "Delayed";
      if (r.status === "completed") return "Completed";
      if (r.status === "in_progress") return "In Progress";
      return "Pending";
    };
    const order = ["Pending", "In Progress", "Completed", "Delayed"];
    const m = new Map<string, number>();
    rows.forEach((r) => {
      const k = labelFor(r);
      m.set(k, (m.get(k) || 0) + 1);
    });
    return order.filter((k) => m.has(k)).map((name) => ({ name, value: m.get(name) as number }));
  }, [rows]);

  const bySite = useMemo(() => {
    type A = { total: number; completed: number; delayed: number };
    const m = new Map<string, A>();
    rows.forEach((r) => {
      const e = m.get(r.site) || { total: 0, completed: 0, delayed: 0 };
      e.total += 1;
      if (r.status === "completed") e.completed += 1;
      if (r.delayed) e.delayed += 1;
      m.set(r.site, e);
    });
    return Array.from(m.entries()).map(([name, v]) => ({
      name,
      Completed: v.completed,
      Delayed: v.delayed,
      Pending: v.total - v.completed - v.delayed,
    }));
  }, [rows]);

  const download = async () => {
    setDownloading(true);
    try {
      await generateReportPdf({
        title: "Milestone Report",
        fileName: `milestone-report.pdf`,
        generatedBy: scope.generatedBy,
        filters: [
          `Site: ${site === "all" ? "All" : sites.find((s) => s.value === site)?.label || "-"}`,
          `Status: ${status === "all" ? "All" : status}`,
          `Period: ${from || "Any"} to ${to || "Any"}`,
        ],
        columns: [
          { header: "Site", width: 2 },
          { header: "Milestone", width: 2.5 },
          { header: "Planned Start", width: 1.6 },
          { header: "Planned End", width: 1.6 },
          { header: "Actual Start", width: 1.6 },
          { header: "Actual End", width: 1.6 },
          { header: "Progress", width: 1.2, align: "right" },
          { header: "Status", width: 1.6 },
        ],
        rows: rows.map((r) => [
          r.site,
          r.name,
          d(r.start_date),
          d(r.end_date),
          d(r.actual_start_date),
          d(r.actual_end_date),
          `${r.percent_complete}%`,
          r.delayed ? "Delayed" : r.status.replace(/_/g, " "),
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
      title="Milestone Report"
      description="Planned vs actual dates, progress and delays by site."
      pill={<DateRangePill />}
      loading={loading}
      downloading={downloading}
      generated={generated}
      recordCount={rows.length}
      onGenerate={generate}
      onDownload={download}
      filters={
        <>
          <SelectField label="Site / Project" value={site} onChange={setSite} allLabel="All Sites" options={sites} />
          <SelectField label="Status" value={status} onChange={setStatus} allLabel="All Statuses" options={STATUS} />
          <DateField label="From Date" value={from} onChange={setFrom} />
          <DateField label="To Date" value={to} onChange={setTo} />
        </>
      }
      summary={<KpiGrid items={kpis} cols={6} />}
      chart={
        <div className="space-y-4">
          <ChartGrid cols={2}>
            <ReportChartCard
              title="Milestone Completion"
              description="Completion percentage per milestone"
              type="hbar"
              data={chartData}
              height={Math.max(260, chartData.length * 30)}
              formatValue={(v) => `${v}%`}
            />
            <ReportChartCard
              title="Status Breakdown"
              description="Milestones by status"
              type="donut"
              data={statusChart}
              height={300}
            />
          </ChartGrid>
          <ReportChartCard
            title="Milestones by Site"
            description="Completed, delayed and pending distribution per site"
            type="stackedBar"
            data={bySite}
            height={Math.max(260, bySite.length * 34)}
            series={[
              { key: "Completed", label: "Completed", color: "hsl(160 64% 42%)" },
              { key: "Pending", label: "Pending", color: "hsl(35 90% 55%)" },
              { key: "Delayed", label: "Delayed", color: "hsl(0 75% 60%)" },
            ]}
          />
        </div>
      }
      table={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Site</TableHead>
              <TableHead>Milestone</TableHead>
              <TableHead>Planned Start</TableHead>
              <TableHead>Planned End</TableHead>
              <TableHead>Actual Start</TableHead>
              <TableHead>Actual End</TableHead>
              <TableHead className="w-[120px]">Progress</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.site}</TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{d(r.start_date)}</TableCell>
                <TableCell>{d(r.end_date)}</TableCell>
                <TableCell>{d(r.actual_start_date)}</TableCell>
                <TableCell>{d(r.actual_end_date)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={r.percent_complete} className="h-2" />
                    <span className="text-xs text-muted-foreground w-9 text-right">{r.percent_complete}%</span>
                  </div>
                </TableCell>
                <TableCell>
                  {r.delayed ? (
                    <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Delayed</Badge>
                  ) : (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      {r.status.replace(/_/g, " ")}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    />
  );
}
