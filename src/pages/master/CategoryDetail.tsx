import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportChartCard } from "@/components/reports/ReportChartCard";
import { FolderTree } from "lucide-react";
import { useProductPurchases, inr, groupSum } from "./useProductPurchases";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

interface Category { id: string; category_name: string; sub_category_name: string | null; is_active: boolean }
interface Product { id: string; product_name: string; default_uom: string | null; is_active: boolean; budgeted_rate: number | null }

export default function CategoryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [category, setCategory] = useState<Category | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      if (!id) return;
      setLoading(true);
      const [{ data: cat }, { data: prods }] = await Promise.all([
        supabase.from("master_categories").select("id, category_name, sub_category_name, is_active").eq("id", id).maybeSingle(),
        supabase.from("master_products").select("id, product_name, default_uom, is_active, budgeted_rate").eq("category_id", id).order("product_name"),
      ]);
      setCategory((cat as Category) || null);
      setProducts((prods || []) as Product[]);
      setLoading(false);
    };
    run();
  }, [id]);

  const productIds = useMemo(() => products.map((p) => p.id), [products]);
  const { lines, isLoading } = useProductPurchases(productIds);

  const stats = useMemo(() => ({
    qty: lines.reduce((s, l) => s + l.qty, 0),
    spend: lines.reduce((s, l) => s + l.amount, 0),
    orders: new Set(lines.map((l) => l.orderId)).size,
    vendors: new Set(lines.map((l) => l.vendorName)).size,
  }), [lines]);

  const byProductSpend = useMemo(() => groupSum(lines, (l) => l.productName, (l) => l.amount).slice(0, 8), [lines]);
  const byProductQty = useMemo(() => groupSum(lines, (l) => l.productName, (l) => l.qty).slice(0, 8), [lines]);
  const bySite = useMemo(() => groupSum(lines, (l) => l.siteName, (l) => l.amount).slice(0, 8), [lines]);
  const byMonth = useMemo(
    () => groupSum(lines, (l) => (l.orderDate || "").slice(0, 7) || "—", (l) => l.amount)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => ({ name: r.name, spend: r.value })),
    [lines]
  );

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }
  if (!category) return <div className="p-6 text-center text-muted-foreground">Category not found.</div>;

  return (
    <motion.div className="p-4 space-y-6 max-w-6xl mx-auto" variants={container} initial="hidden" animate="show">
      <motion.div variants={item}>
        <Card className="shadow-card">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-full bg-cyan-100 text-cyan-600"><FolderTree className="h-6 w-6" /></div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold truncate">{category.category_name}</h1>
                <p className="text-sm text-muted-foreground">{category.sub_category_name || "All sub categories"}</p>
                <Badge className="mt-2" variant={category.is_active ? "default" : "secondary"}>{category.is_active ? "Active" : "Inactive"}</Badge>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5">
              {[
                { label: "Products", value: String(products.length) },
                { label: "Total Qty", value: stats.qty.toLocaleString("en-IN") },
                { label: "Total Spend", value: inr(stats.spend) },
                { label: "Requisitions", value: String(stats.orders) },
                { label: "Vendors", value: String(stats.vendors) },
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
        <ReportChartCard title="Spend by Product" type="donut" data={byProductSpend} formatValue={inr} centerLabel={{ value: inr(stats.spend), label: "Total spend" }} />
        <ReportChartCard title="Quantity by Product" type="hbar" data={byProductQty} />
        <ReportChartCard title="Spend by Project / Site" type="bar" data={bySite} formatValue={inr} />
        <ReportChartCard title="Spend Trend by Month" type="area" data={byMonth} series={[{ key: "spend", label: "Spend" }]} formatValue={inr} />
      </motion.div>

      <motion.div variants={item}>
        <Card>
          <CardHeader><CardTitle className="text-base">Products in this Category ({products.length})</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            {products.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No products in this category.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>UOM</TableHead>
                    <TableHead className="text-right">Qty Purchased</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => {
                    const pl = lines.filter((l) => l.productId === p.id);
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <button className="text-primary font-medium underline underline-offset-2" onClick={() => navigate(`/master-data/products/${p.id}`)}>
                            {p.product_name}
                          </button>
                        </TableCell>
                        <TableCell>{p.default_uom || "—"}</TableCell>
                        <TableCell className="text-right">{pl.reduce((s, l) => s + l.qty, 0).toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-right">{inr(pl.reduce((s, l) => s + l.amount, 0))}</TableCell>
                        <TableCell><Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={item}>
        <Card>
          <CardHeader><CardTitle className="text-base">Purchases in this Category ({lines.length})</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
            ) : lines.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No purchases recorded in this category yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Requisition</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Project / Site</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.itemId}>
                      <TableCell>
                        <button className="text-primary underline underline-offset-2" onClick={() => l.productId && navigate(`/master-data/products/${l.productId}`)}>
                          {l.productName}
                        </button>
                      </TableCell>
                      <TableCell>
                        <button className="text-primary underline underline-offset-2" onClick={() => navigate(`/procurement?po=${l.orderId}`)}>{l.reqNumber}</button>
                      </TableCell>
                      <TableCell>{l.orderDate || "—"}</TableCell>
                      <TableCell>{l.vendorName}</TableCell>
                      <TableCell>{l.siteName}</TableCell>
                      <TableCell className="text-right">{l.qty.toLocaleString("en-IN")} {l.uom || ""}</TableCell>
                      <TableCell className="text-right font-medium">{inr(l.amount)}</TableCell>
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
