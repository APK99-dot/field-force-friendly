import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Wallet, CheckCircle2, AlertTriangle, FileText, PiggyBank, TrendingDown } from "lucide-react";
import { ReportShell } from "./ReportShell";
import { ReportChartCard } from "./ReportChartCard";
import { KpiGrid, ChartGrid, KpiItem } from "./KpiCards";
import { DateField, SelectField } from "./ReportFilters";
import { useReportScope } from "./useReportScope";
import { useReportContext, DateRangePill } from "@/components/analytics/ReportContext";
import { generateReportPdf } from "./reportPdf";

interface Row {
  id: string;
  /** Purchase order behind the invoice. Null when the invoice has no PO. */
  po_id: string | null;
  po_number: string;
  vendor: string;
  invoice_number: string;
  invoice_amount: number;
  paid: number;
  balance: number;
  reference: string;
  bank: string;
  payment_date: string | null;
  payment_status: string;
}

const PAY_STATUS = [
  { value: "Paid", label: "Paid" },
  { value: "Partial", label: "Partial" },
  { value: "Unpaid", label: "Unpaid" },
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

export default function PaymentReport() {
  const scope = useReportScope();
  const { from, to, setFrom, setTo } = useReportContext();
  const [vendor, setVendor] = useState("all");
  const [site, setSite] = useState("all");
  const [payStatus, setPayStatus] = useState("all");
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

  const generate = async () => {
    setLoading(true);
    try {
      const { data: invoices, error } = await supabase
        .from("procurement_invoices")
        .select("id, po_id, invoice_number, invoice_date, invoice_amount")
        .gte("invoice_date", from)
        .lte("invoice_date", to)
        .order("invoice_date", { ascending: false });
      if (error) throw error;

      const poIds = [...new Set((invoices || []).map((i) => i.po_id).filter(Boolean))] as string[];
      const { data: orders } = poIds.length
        ? await supabase
            .from("procurement_orders")
            .select("id, po_number, vendor_id, site_id")
            .in("id", poIds)
        : { data: [] as any[] };
      const orderMap = new Map((orders || []).map((o) => [o.id, o]));

      const invIds = (invoices || []).map((i) => i.id);
      const payMap = new Map<string, { total: number; last?: any }>();
      if (invIds.length) {
        const { data: payments } = await supabase
          .from("procurement_invoice_payments")
          .select("invoice_id, reference_number, bank_name, amount, payment_date")
          .in("invoice_id", invIds)
          .order("payment_date", { ascending: true });
        (payments || []).forEach((p) => {
          const e = payMap.get(p.invoice_id) || { total: 0 };
          e.total += Number(p.amount || 0);
          e.last = p;
          payMap.set(p.invoice_id, e);
        });
      }

      const vendorMap = new Map(vendors.map((v) => [v.value, v.label]));
      const siteMap = new Map(sites.map((s) => [s.value, s.label]));

      let result: Row[] = (invoices || []).map((inv) => {
        const order = inv.po_id ? orderMap.get(inv.po_id) : null;
        const pay = payMap.get(inv.id);
        const amount = Number(inv.invoice_amount || 0);
        const paid = pay?.total || 0;
        const ps = paid <= 0 ? "Unpaid" : paid >= amount && amount > 0 ? "Paid" : "Partial";
        return {
          id: inv.id,
          // id above is the invoice; the PO is what the row navigates to, and
          // an invoice can exist without one, hence nullable.
          po_id: (inv.po_id as string | null) ?? null,
          po_number: order?.po_number || "—",
          vendor: order?.vendor_id ? vendorMap.get(order.vendor_id) || "-" : "-",
          invoice_number: inv.invoice_number || "—",
          invoice_amount: amount,
          paid,
          balance: Math.max(0, amount - paid),
          reference: pay?.last?.reference_number || "-",
          bank: pay?.last?.bank_name || "-",
          payment_date: pay?.last?.payment_date || null,
          payment_status: ps,
          _order: order,
        } as Row & { _order: any };
      });

      // filters that rely on joined order
      if (vendor !== "all") result = result.filter((r) => (r as any)._order?.vendor_id === vendor);
      if (site !== "all") result = result.filter((r) => (r as any)._order?.site_id === site);
      if (payStatus !== "all") result = result.filter((r) => r.payment_status === payStatus);

      setRows(result);
      setGenerated(true);
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const kpis: KpiItem[] = useMemo(() => {
    const invoiced = rows.reduce((s, r) => s + r.invoice_amount, 0);
    const paid = rows.reduce((s, r) => s + r.paid, 0);
    const balance = rows.reduce((s, r) => s + r.balance, 0);
    const collectionRate = invoiced ? (paid / invoiced) * 100 : 0;
    const paidCount = rows.filter((r) => r.payment_status === "Paid").length;
    const unpaidCount = rows.filter((r) => r.payment_status === "Unpaid").length;
    const short = (n: number) =>
      n >= 10000000 ? `Rs ${(n / 10000000).toFixed(2)}Cr` : n >= 100000 ? `Rs ${(n / 100000).toFixed(2)}L` : inr(n);
    return [
      { label: "Total Invoiced", value: short(invoiced), sub: `${rows.length} invoices`, icon: FileText, tone: "primary" },
      { label: "Total Paid", value: short(paid), icon: CheckCircle2, tone: "success" },
      { label: "Balance Due", value: short(balance), icon: AlertTriangle, tone: "danger" },
      { label: "Collection Rate", value: `${collectionRate.toFixed(1)}%`, icon: TrendingDown, tone: "info" },
      { label: "Paid Invoices", value: String(paidCount), icon: PiggyBank, tone: "success" },
      { label: "Unpaid", value: String(unpaidCount), icon: Wallet, tone: "warning" },
    ];
  }, [rows]);

  const chartData = useMemo(() => {
    const m = new Map<string, { name: string; Paid: number; Pending: number }>();
    rows.forEach((r) => {
      const e = m.get(r.vendor) || { name: r.vendor, Paid: 0, Pending: 0 };
      e.Paid += r.paid;
      e.Pending += r.balance;
      m.set(r.vendor, e);
    });
    return Array.from(m.values())
      .sort((a, b) => b.Paid + b.Pending - (a.Paid + a.Pending))
      .slice(0, 10);
  }, [rows]);

  const statusChart = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.payment_status, (m.get(r.payment_status) || 0) + 1));
    return ["Paid", "Partial", "Unpaid"]
      .filter((k) => m.has(k))
      .map((name) => ({ name, value: m.get(name) as number }));
  }, [rows]);

  const monthlyTrend = useMemo(() => {
    const m = new Map<string, { Invoiced: number; Paid: number }>();
    rows.forEach((r) => {
      const key = r.payment_date
        ? format(new Date(r.payment_date), "MMM yyyy")
        : format(new Date(from), "MMM yyyy");
      const e = m.get(key) || { Invoiced: 0, Paid: 0 };
      e.Invoiced += r.invoice_amount;
      e.Paid += r.paid;
      m.set(key, e);
    });
    return Array.from(m.entries()).map(([name, v]) => ({
      name,
      Invoiced: +v.Invoiced.toFixed(2),
      Paid: +v.Paid.toFixed(2),
    }));
  }, [rows, from]);

  const download = async () => {
    setDownloading(true);
    try {
      await generateReportPdf({
        title: "Payment Report",
        fileName: `payment-report-${from}-to-${to}.pdf`,
        generatedBy: scope.generatedBy,
        filters: [
          `Period: ${from} to ${to}`,
          `Vendor: ${vendor === "all" ? "All" : vendors.find((v) => v.value === vendor)?.label || "-"}`,
          `Site: ${site === "all" ? "All" : sites.find((s) => s.value === site)?.label || "-"}`,
          `Payment Status: ${payStatus === "all" ? "All" : payStatus}`,
        ],
        columns: [
          { header: "PO No.", width: 1.3 },
          { header: "Vendor", width: 2 },
          { header: "Invoice No.", width: 1.5 },
          { header: "Invoice Amt", width: 1.6, align: "right" },
          { header: "Paid", width: 1.5, align: "right" },
          { header: "Balance", width: 1.5, align: "right" },
          { header: "Reference", width: 1.6 },
          { header: "Bank", width: 1.6 },
          { header: "Pay Date", width: 1.5 },
        ],
        rows: rows.map((r) => [
          r.po_number,
          r.vendor,
          r.invoice_number,
          inr(r.invoice_amount),
          inr(r.paid),
          inr(r.balance),
          r.reference,
          r.bank,
          r.payment_date ? format(new Date(r.payment_date), "dd MMM yyyy") : "--",
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
      title="Payment Report"
      description="Invoices, amounts paid, balance due and references."
      pill={<DateRangePill />}
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
          <SelectField label="Vendor" value={vendor} onChange={setVendor} allLabel="All Vendors" options={vendors} />
          <SelectField label="Site / Project" value={site} onChange={setSite} allLabel="All Sites" options={sites} />
          <SelectField label="Payment Status" value={payStatus} onChange={setPayStatus} allLabel="All" options={PAY_STATUS} />
        </>
      }
      summary={<KpiGrid items={kpis} cols={6} />}
      chart={
        <div className="space-y-4">
          <ChartGrid cols={2}>
            <ReportChartCard
              title="Top Vendors — Paid vs Pending"
              description="Highest-value vendors and their payment split"
              type="stackedBar"
              data={chartData}
              height={Math.max(280, chartData.length * 34)}
              series={[
                { key: "Paid", label: "Paid", color: "hsl(160 64% 42%)" },
                { key: "Pending", label: "Pending", color: "hsl(0 75% 60%)" },
              ]}
              formatValue={inr}
            />
            <ReportChartCard
              title="Payment Status"
              description="Invoices by payment status"
              type="donut"
              data={statusChart}
              height={300}
            />
          </ChartGrid>
          <ReportChartCard
            title="Monthly Cashflow — Invoiced vs Paid"
            description="Compare invoiced amount against actual payments"
            type="line"
            data={monthlyTrend}
            series={[
              { key: "Invoiced", label: "Invoiced", color: "hsl(220 90% 55%)" },
              { key: "Paid", label: "Paid", color: "hsl(160 64% 42%)" },
            ]}
            formatValue={inr}
          />
        </div>
      }
      table={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO No.</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Invoice No.</TableHead>
              <TableHead className="text-right">Invoice Amt</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Bank</TableHead>
              <TableHead>Pay Date</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow
                key={r.id}
                onClick={() => r.po_id && navigate(`/procurement?po=${r.po_id}&from=${encodeURIComponent("/analytics?tab=payments")}`)}
                className={r.po_id ? "cursor-pointer hover:bg-muted/50" : undefined}
              >
                <TableCell className="font-medium">{r.po_number}</TableCell>
                <TableCell>{r.vendor}</TableCell>
                <TableCell>{r.invoice_number}</TableCell>
                <TableCell className="text-right">{inr(r.invoice_amount)}</TableCell>
                <TableCell className="text-right">{inr(r.paid)}</TableCell>
                <TableCell className="text-right">{inr(r.balance)}</TableCell>
                <TableCell>{r.reference}</TableCell>
                <TableCell>{r.bank}</TableCell>
                <TableCell>{r.payment_date ? format(new Date(r.payment_date), "dd MMM yyyy") : "--"}</TableCell>
                <TableCell>{payBadge(r.payment_status)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    />
  );
}
