import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportChartCard } from "@/components/reports/ReportChartCard";
import { Package } from "lucide-react";
import { useProductPurchases, inr, groupSum } from "./useProductPurchases";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

interface Product {
  id: string;
  product_name: string;
  category_id: string | null;
  default_uom: string | null;
  is_active: boolean;
  budgeted_rate: number | null;
  lead_time_days: number | null;
  product_description: string | null;
}

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [categoryName, setCategoryName] = useState<string>("—");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      if (!id) return;
      setLoading(true);
      const { data } = await supabase
        .from("master_products")
        .select("id, product_name, category_id, default_uom, is_active, budgeted_rate, lead_time_days, product_description")
        .eq("id", id)
        .maybeSingle();
      setProduct((data as Product) || null);
      if (data?.category_id) {
        const { data: cat } = await supabase
          .from("master_categories")
          .select("category_name, sub_category_name")
          .eq("id", data.category_id)
          .maybeSingle();
        if (cat) setCategoryName(`${cat.category_name}${cat.sub_category_name ? " — " + cat.sub_category_name : ""}`);
      }
      setLoading(false);
    };
    run();
  }, [id]);

  const { lines, isLoading } = useProductPurchases(id ? [id] : null);

  const stats = useMemo(() => {
    const qty = lines.reduce((s, l) => s + l.qty, 0);
    const spend = lines.reduce((s, l) => s + l.amount, 0);
    const rates = lines.filter((l) => l.rate > 0).map((l) => l.rate);
    return {
      qty,
      spend,
      orders: new Set(lines.map((l) => l.orderId)).size,
      vendors: new Set(lines.map((l) => l.vendorName)).size,
      avgRate: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0,
      minRate: rates.length ? Math.min(...rates) : 0,
      maxRate: rates.length ? Math.max(...rates) : 0,
    };
  }, [lines]);

  const byVendor = useMemo(() => groupSum(lines, (l) => l.vendorName, (l) => l.amount).slice(0, 8), [lines]);
  const bySite = useMemo(() => groupSum(lines, (l) => l.siteName, (l) => l.qty).slice(0, 8), [lines]);
  const byMonth = useMemo(() => {
    const rows = groupSum(lines, (l) => (l.orderDate || "").slice(0, 7) || "—", (l) => l.amount);
    return rows.sort((a, b) => a.name.localeCompare(b.name)).map((r) => ({ name: r.name, spend: r.value }));
  }, [lines]);
  const rateTrend = useMemo(
    () =>
      lines
        .filter((l) => l.rate > 0 && l.orderDate)
        .slice()
        .sort((a, b) => (a.orderDate || "").localeCompare(b.orderDate || ""))
        .map((l) => ({ name: l.orderDate as string, rate: l.rate })),
    [lines]
  );

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }
  if (!product) {
    return <div className="p-6 text-center text-muted-foreground">Product not found.</div>;
  }

  return (
    <motion.div className="p-4 space-y-6 max-w-6xl mx-auto" variants={container} initial="hidden" animate="show">
      <motion.div variants={item}>
        <Card className="shadow-card">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-full bg-violet-100 text-violet-600"><Package className="h-6 w-6" /></div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold truncate">{product.product_name}</h1>
                <p className="text-sm text-muted-foreground">
                  {categoryName} · UOM {product.default_uom || "—"}
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant={product.is_active ? "default" : "secondary"}>{product.is_active ? "Active" : "Inactive"}</Badge>
                  {product.budgeted_rate != null && <Badge variant="outline">Budget rate {inr(product.budgeted_rate)}</Badge>}
                  {product.lead_time_days != null && <Badge variant="outline">Lead time {product.lead_time_days}d</Badge>}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5">
              {[
                { label: "Total Qty", value: stats.qty.toLocaleString("en-IN") },
                { label: "Total Spend", value: inr(stats.spend) },
                { label: "Requisitions", value: String(stats.orders) },
                { label: "Vendors", value: String(stats.vendors) },
                { label: "Avg Rate", value: inr(stats.avgRate) },
                { label: "Rate Range", value: `${inr(stats.minRate)} – ${inr(stats.maxRate)}` },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
                  <p className="text-sm font-bold mt-1">{s.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ReportChartCard title="Spend by Vendor" type="donut" data={byVendor} formatValue={inr} centerLabel={{ value: inr(stats.spend), label: "Total spend" }} />
        <ReportChartCard title="Quantity by Project / Site" type="hbar" data={bySite} />
        <ReportChartCard title="Spend Trend by Month" type="area" data={byMonth} series={[{ key: "spend", label: "Spend" }]} formatValue={inr} />
        <ReportChartCard title="Rate Trend" type="line" data={rateTrend} series={[{ key: "rate", label: "Rate" }]} formatValue={inr} />
      </motion.div>

      <motion.div variants={item}>
        <Card>
          <CardHeader><CardTitle className="text-base">Purchase History ({lines.length})</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
            ) : lines.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No purchases recorded for this product yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Requisition</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Project / Site</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.itemId}>
                      <TableCell>
                        <button className="text-primary underline underline-offset-2" onClick={() => navigate(`/procurement?po=${l.orderId}`)}>
                          {l.reqNumber}
                        </button>
                      </TableCell>
                      <TableCell>{l.orderDate || "—"}</TableCell>
                      <TableCell>{l.vendorName}</TableCell>
                      <TableCell>{l.siteName}</TableCell>
                      <TableCell className="text-right">{l.qty.toLocaleString("en-IN")} {l.uom || ""}</TableCell>
                      <TableCell className="text-right">{inr(l.rate)}</TableCell>
                      <TableCell className="text-right font-medium">{inr(l.amount)}</TableCell>
                      <TableCell><Badge variant="outline">{l.status || "—"}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
