import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ReportShell } from "./ReportShell";
import { ReportChartCard } from "./ReportChartCard";
import { KpiGrid, ChartGrid, KpiItem } from "./KpiCards";
import { DateField, SelectField } from "./ReportFilters";
import { useReportScope } from "./useReportScope";
import { useReportContext, DateRangePill } from "@/components/analytics/ReportContext";
import { generateReportPdf } from "./reportPdf";
import { X, ShoppingCart, IndianRupee, CheckCircle2, Clock, Building2, Package } from "lucide-react";

interface Row {
  id: string;
  po_number: string;
  order_date: string | null;
  vendor: string;
  site: string;
  items: number;
  po_value: number;
  status: string;
  paid: number;
  payment_status: string;
  bill_gst: string;
  ship_gst: string;
}

const STATUS = [
  { value: "Requisition", label: "Requisition" },
  { value: "PO Issued", label: "PO Issued" },
  { value: "PO Sent", label: "PO Sent" },
  { value: "Invoice Received", label: "Invoice Received" },
  { value: "Closed", label: "Closed" },
];

const inr = (n: number) => `Rs ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const payBadge = (s: string) => {
  const map: Record<string, string> = {
    Paid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    Partial: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    Unpaid: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };
  return <Badge className={map[s] || "bg-muted text-muted-foreground"}>{s}</Badge>;
};

export default function ProcurementReport() {
  const scope = useReportScope();
  const { from, to, setFrom, setTo, procurementPendingOnly, setProcurementPendingOnly } = useReportContext();
  const [site, setSite] = useState("all");
  const [vendor, setVendor] = useState("all");
  const [status, setStatus] = useState("all");
  const [sites, setSites] = useState<{ value: string; label: string }[]>([]);
  const [vendors, setVendors] = useState<{ value: string; label: string }[]>([]);
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
      .from("vendors")
      .select("id, name")
      .order("name")
      .then(({ data }) => setVendors((data || []).map((v) => ({ value: v.id, label: v.name }))));
  }, []);

  // Auto-run when navigated here from the "Pending Approvals" card.
  useEffect(() => {
    if (procurementPendingOnly && sites.length && vendors.length && !generated) {
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [procurementPendingOnly, sites, vendors]);

  const generate = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("procurement_orders")
        .select("id, po_number, order_date, vendor_id, site_id, status, total_amount, bill_to_gst, ship_to_gst")
        .gte("order_date", from)
        .lte("order_date", to)
        .order("order_date", { ascending: false });
      if (site !== "all") q = q.eq("site_id", site);
      if (vendor !== "all") q = q.eq("vendor_id", vendor);
      if (status !== "all") q = q.eq("status", status);
      if (procurementPendingOnly) q = q.neq("status", "Closed");
      const { data, error } = await q;
      if (error) throw error;
      const orders = data || [];
      const poIds = orders.map((o) => o.id);

      // item counts
      const itemCount = new Map<string, number>();
      if (poIds.length) {
        const { data: items } = await supabase
          .from("procurement_items")
          .select("procurement_id")
          .in("procurement_id", poIds);
        (items || []).forEach((it) => itemCount.set(it.procurement_id, (itemCount.get(it.procurement_id) || 0) + 1));
      }

      // payments via invoices
      const paidByPo = new Map<string, number>();
      if (poIds.length) {
        const { data: invoices } = await supabase
          .from("procurement_invoices")
          .select("id, po_id")
          .in("po_id", poIds);
        const invIds = (invoices || []).map((i) => i.id);
        const invToPo = new Map((invoices || []).map((i) => [i.id, i.po_id]));
        if (invIds.length) {
          const { data: payments } = await supabase
            .from("procurement_invoice_payments")
            .select("invoice_id, amount")
            .in("invoice_id", invIds);
          (payments || []).forEach((p) => {
            const po = invToPo.get(p.invoice_id);
            if (po) paidByPo.set(po, (paidByPo.get(po) || 0) + Number(p.amount || 0));
          });
        }
      }

      // Full site lookup (includes inactive/deleted sites) so no PO falls into an unlabeled bucket
      const { data: allSites } = await supabase.from("project_sites").select("id, site_name");
      const siteMap = new Map((allSites || []).map((s) => [s.id, s.site_name]));
      const vendorMap = new Map(vendors.map((v) => [v.value, v.label]));

      setRows(
        orders.map((o) => {
          const value = Number(o.total_amount || 0);
          const paid = paidByPo.get(o.id) || 0;
          const ps = paid <= 0 ? "Unpaid" : paid >= value && value > 0 ? "Paid" : "Partial";
          return {
            id: o.id,
            po_number: o.po_number || "—",
            order_date: o.order_date,
            vendor: o.vendor_id ? vendorMap.get(o.vendor_id) || "-" : "-",
            site: (o.site_id && siteMap.get(o.site_id)) || "Unassigned Site",
            items: itemCount.get(o.id) || 0,
            po_value: value,
            status: o.status,
            paid,
            payment_status: ps,
            bill_gst: (o as any).bill_to_gst || "",
            ship_gst: (o as any).ship_to_gst || "",
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

  const short = (n: number) =>
    n >= 10000000 ? `Rs ${(n / 10000000).toFixed(2)}Cr` : n >= 100000 ? `Rs ${(n / 100000).toFixed(2)}L` : inr(n);

  const kpis: KpiItem[] = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.po_value, 0);
    const paid = rows.reduce((s, r) => s + r.paid, 0);
    const pending = Math.max(0, total - paid);
    const open = rows.filter((r) => r.status !== "Closed").length;
    const closed = rows.filter((r) => r.status === "Closed").length;
    const avg = rows.length ? total / rows.length : 0;
    const uniqueVendors = new Set(rows.map((r) => r.vendor).filter((v) => v && v !== "-")).size;
    return [
      { label: "Total POs", value: String(rows.length), sub: `${open} open · ${closed} closed`, icon: ShoppingCart, tone: "primary" },
      { label: "PO Value", value: short(total), icon: IndianRupee, tone: "info" },
      { label: "Paid", value: short(paid), icon: CheckCircle2, tone: "success" },
      { label: "Pending", value: short(pending), icon: Clock, tone: "warning" },
      { label: "Avg PO", value: short(avg), icon: Package, tone: "muted" },
      { label: "Vendors", value: String(uniqueVendors), icon: Building2, tone: "primary" },
    ];
  }, [rows]);

  const siteChart = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.site, (m.get(r.site) || 0) + r.po_value));
    return Array.from(m.entries())
      .map(([name, value]) => ({ name, value: +value.toFixed(2) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [rows]);

  const statusChart = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.status, (m.get(r.status) || 0) + 1));
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [rows]);

  const payStatusChart = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.payment_status, (m.get(r.payment_status) || 0) + 1));
    return ["Paid", "Partial", "Unpaid"]
      .filter((k) => m.has(k))
      .map((name) => ({ name, value: m.get(name) as number }));
  }, [rows]);

  const monthlyTrend = useMemo(() => {
    const m = new Map<string, { Value: number; Paid: number }>();
    rows.forEach((r) => {
      const key = r.order_date ? format(new Date(r.order_date), "MMM yyyy") : "—";
      const e = m.get(key) || { Value: 0, Paid: 0 };
      e.Value += r.po_value;
      e.Paid += r.paid;
      m.set(key, e);
    });
    return Array.from(m.entries()).map(([name, v]) => ({
      name,
      "PO Value": +v.Value.toFixed(2),
      Paid: +v.Paid.toFixed(2),
    }));
  }, [rows]);

  const download = async () => {
    setDownloading(true);
    try {
      await generateReportPdf({
        title: "Procurement Report",
        fileName: `procurement-report-${from}-to-${to}.pdf`,
        generatedBy: scope.generatedBy,
        filters: [
          `Period: ${from} to ${to}`,
          `Site: ${site === "all" ? "All" : sites.find((s) => s.value === site)?.label || "-"}`,
          `Vendor: ${vendor === "all" ? "All" : vendors.find((v) => v.value === vendor)?.label || "-"}`,
          `Status: ${status === "all" ? "All" : status}`,
        ],
        columns: [
          { header: "PO Number", width: 1.5 },
          { header: "Requisition Date", width: 1.6 },
          { header: "Vendor", width: 2.2 },
          { header: "Site", width: 1.8 },
          { header: "Items", width: 0.8, align: "right" },
          { header: "PO Value", width: 1.6, align: "right" },
          { header: "Status", width: 1.6 },
          { header: "Payment", width: 1.2 },
          { header: "Bill GST", width: 1.6 },
          { header: "Ship GST", width: 1.6 },
        ],
        rows: rows.map((r) => [
          r.po_number,
          r.order_date ? format(new Date(r.order_date), "dd MMM yyyy") : "--",
          r.vendor,
          r.site,
          String(r.items),
          inr(r.po_value),
          r.status,
          r.payment_status,
          r.bill_gst || "—",
          r.ship_gst || "—",
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
      title="Procurement Report"
      description="Purchase orders, vendors, values and payment status."
      pill={
        <div className="flex flex-wrap items-center gap-2">
          {procurementPendingOnly && (
            <Badge variant="default" className="gap-1.5">
              Pending Approval Only
              <button
                onClick={() => setProcurementPendingOnly(false)}
                aria-label="Clear pending filter"
                className="ml-0.5 rounded-full hover:bg-primary-foreground/20"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          <DateRangePill />
        </div>
      }
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
          <SelectField label="Site / Project" value={site} onChange={setSite} allLabel="All Sites" options={sites} />
          <SelectField label="Vendor" value={vendor} onChange={setVendor} allLabel="All Vendors" options={vendors} />
          <SelectField label="Status" value={status} onChange={setStatus} allLabel="All Statuses" options={STATUS} />
        </>
      }
      summary={<KpiGrid items={kpis} cols={6} />}
      chart={
        <div className="space-y-4">
          <ChartGrid cols={2}>
            <ReportChartCard
              title="Top Sites by PO Value"
              description="Purchase spend concentration across active sites"
              type="hbar"
              data={siteChart}
              height={Math.max(280, siteChart.length * 34)}
              formatValue={short}
            />
            <ReportChartCard
              title="Payment Status"
              description="Purchase orders by payment status"
              type="donut"
              data={payStatusChart}
              height={300}
            />
          </ChartGrid>
          <ChartGrid cols={2}>
            <ReportChartCard
              title="Monthly Spend Trend"
              description="PO value vs paid amount over time"
              type="line"
              data={monthlyTrend}
              series={[
                { key: "PO Value", label: "PO Value", color: "hsl(220 90% 55%)" },
                { key: "Paid", label: "Paid", color: "hsl(160 64% 42%)" },
              ]}
              formatValue={short}
            />
            <ReportChartCard
              title="Workflow Stage Distribution"
              description="POs by current procurement stage"
              type="bar"
              data={statusChart}
              height={300}
            />
          </ChartGrid>
        </div>
      }
      table={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO Number</TableHead>
              <TableHead>Requisition Date</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Site</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">PO Value</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              // The row id is the purchase order id, so the report links
              // straight at the record rather than making people search for it.
              <TableRow
                key={r.id}
                onClick={() => navigate(`/procurement?po=${r.id}`)}
                className="cursor-pointer hover:bg-muted/50"
              >
                <TableCell className="font-medium">{r.po_number}</TableCell>
                <TableCell>{r.order_date ? format(new Date(r.order_date), "dd MMM yyyy") : "--"}</TableCell>
                <TableCell>{r.vendor}</TableCell>
                <TableCell>{r.site}</TableCell>
                <TableCell className="text-right">{r.items}</TableCell>
                <TableCell className="text-right">{inr(r.po_value)}</TableCell>
                <TableCell>{r.status}</TableCell>
                <TableCell>{payBadge(r.payment_status)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    />
  );
}
