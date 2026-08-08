import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PurchaseLine {
  itemId: string;
  productId: string | null;
  productName: string;
  qty: number;
  rate: number;
  amount: number;
  uom: string | null;
  vendorName: string;
  siteName: string;
  orderDate: string | null;
  status: string | null;
  orderId: string;
  reqNumber: string;
  poNumber: string | null;
}

export function useProductPurchases(productIds: string[] | null) {
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const key = (productIds || []).slice().sort().join(",");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setIsLoading(true);
      const ids = (productIds || []).filter(Boolean);
      if (ids.length === 0) {
        if (!cancelled) { setLines([]); setIsLoading(false); }
        return;
      }
      const [{ data: items }, { data: vendors }, { data: sites }, { data: prods }] = await Promise.all([
        supabase
          .from("procurement_items")
          .select(
            "id, product_id, qty, rate, amount, uom, vendor_ids, procurement_orders!inner(id, requisition_number, po_number, order_date, created_at, status, site_id, vendor_id)"
          )
          .in("product_id", ids),
        supabase.from("vendors").select("id, name"),
        supabase.from("project_sites").select("id, site_name"),
        supabase.from("master_products").select("id, product_name").in("id", ids),
      ]);

      const vMap = new Map((vendors || []).map((v: any) => [v.id, v.name]));
      const sMap = new Map((sites || []).map((s: any) => [s.id, s.site_name]));
      const pMap = new Map((prods || []).map((p: any) => [p.id, p.product_name]));

      const mapped: PurchaseLine[] = (items || []).map((it: any) => {
        const o = it.procurement_orders;
        const vId = (it.vendor_ids && it.vendor_ids[0]) || o?.vendor_id || null;
        return {
          itemId: it.id,
          productId: it.product_id,
          productName: pMap.get(it.product_id) || "—",
          qty: Number(it.qty) || 0,
          rate: Number(it.rate) || 0,
          amount: Number(it.amount) || 0,
          uom: it.uom,
          vendorName: (vId && vMap.get(vId)) || "Unassigned",
          siteName: (o?.site_id && sMap.get(o.site_id)) || "—",
          orderDate: o?.order_date || (o?.created_at ? String(o.created_at).slice(0, 10) : null),
          status: o?.status || null,
          orderId: o?.id,
          reqNumber: o?.requisition_number || o?.po_number || "—",
          poNumber: o?.po_number || null,
        };
      });

      mapped.sort((a, b) => (b.orderDate || "").localeCompare(a.orderDate || ""));
      if (!cancelled) { setLines(mapped); setIsLoading(false); }
    };
    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { lines, isLoading };
}

export const inr = (v: number) =>
  `₹${(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function groupSum<T>(rows: T[], keyFn: (r: T) => string, valFn: (r: T) => number) {
  const m = new Map<string, number>();
  rows.forEach((r) => {
    const k = keyFn(r) || "—";
    m.set(k, (m.get(k) || 0) + valFn(r));
  });
  return Array.from(m.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}
