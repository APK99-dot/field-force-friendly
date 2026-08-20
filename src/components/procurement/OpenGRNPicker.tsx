import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, Truck, Check, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { statusColor, fmtAmt } from "@/lib/procurement";

// Statuses that represent an "open" record still awaiting goods receipt
const VENDOR_OPEN = ["PO Issued", "Goods Received"];
const TRANSFER_OPEN = ["Requisition Approved", "Goods Received"];

interface OpenPO {
  id: string;
  po_number: string | null;
  status: string;
  order_date: string;
  total_amount: number;
  vendor_id: string | null;
  vendor_name: string;
  source_type: string | null;
  transfer_from_site_id: string | null;
  transfer_from_name: string;
}

interface Props {
  siteId: string;
  value: string;
  onChange: (poId: string) => void;
}

interface PreviewLine {
  id: string;
  product_name: string;
  uom: string | null;
  qty: number;
  rate: number;
  received: number;
  pending: number;
}

interface PreviewData {
  po: OpenPO;
  lines: PreviewLine[];
  loading: boolean;
}

export default function OpenGRNPicker({ siteId, value, onChange }: Props) {
  const [pos, setPos] = useState<OpenPO[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<PreviewData | null>(null);

  useEffect(() => {
    if (!siteId) {
      setPos([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("procurement_orders")
        .select("id, po_number, status, order_date, total_amount, vendor_id, source_type, transfer_from_site_id")
        .eq("site_id", siteId)
        // Salesforce history only. Those 534 imported POs arrived already
        // closed out in Salesforce — receiving against one here would create a
        // GRN for goods delivered long ago, and buries the handful of live POs
        // a site engineer is actually looking for.
        .is("salesforce_id", null)
        .in("status", [...new Set([...VENDOR_OPEN, ...TRANSFER_OPEN])])
        .order("order_date", { ascending: false });
      let rows = (data || []) as any[];
      // Keep vendor POs at vendor-open statuses, and transfers at transfer-open statuses
      rows = rows.filter((r) =>
        r.source_type === "internal_transfer"
          ? TRANSFER_OPEN.includes(r.status)
          : VENDOR_OPEN.includes(r.status)
      );

      // Filter out fully-received POs using a batched pending-qty computation
      const poIds = rows.map((r) => r.id);
      if (poIds.length) {
        const itemsRes: any = await (supabase.from("procurement_items") as any).select("id, procurement_id, qty").in("procurement_id", poIds);
        const grnRes: any = await (supabase.from("procurement_grns") as any).select("id, po_id").in("po_id", poIds);
        const grnIds = ((grnRes.data || []) as any[]).map((g) => g.id);
        let grnItemsData: any[] = [];
        if (grnIds.length) {
          const giRes: any = await supabase.from("procurement_grn_items").select("procurement_item_id, received_qty, grn_id").in("grn_id", grnIds);
          grnItemsData = (giRes.data || []) as any[];
        }
        const recvByItem: Record<string, number> = {};
        grnItemsData.forEach((gi) => {
          if (gi.procurement_item_id) recvByItem[gi.procurement_item_id] = (recvByItem[gi.procurement_item_id] || 0) + Number(gi.received_qty || 0);
        });
        const itemsData = (itemsRes.data || []) as any[];
        const poHasItems: Record<string, boolean> = {};
        const pendingByPo: Record<string, number> = {};
        itemsData.forEach((it) => {
          poHasItems[it.procurement_id] = true;
          const pending = Number(it.qty || 0) - Number(recvByItem[it.id] || 0);
          pendingByPo[it.procurement_id] = (pendingByPo[it.procurement_id] || 0) + Math.max(0, pending);
        });
        // Hide only POs where every line item is fully received.
        // If a PO has no items loaded (edge case), keep it visible.
        rows = rows.filter((r) => !poHasItems[r.id] || (pendingByPo[r.id] || 0) > 0);
      }
      const vendorIds = [...new Set(rows.filter((r) => r.vendor_id).map((r) => r.vendor_id))];
      let vmap: Record<string, string> = {};
      if (vendorIds.length) {
        const { data: vendors } = await supabase.from("vendors").select("id, name").in("id", vendorIds);
        (vendors || []).forEach((v: any) => { vmap[v.id] = v.name; });
      }
      const fromIds = [...new Set(rows.filter((r) => r.transfer_from_site_id).map((r) => r.transfer_from_site_id))];
      let smap: Record<string, string> = {};
      if (fromIds.length) {
        const { data: sitesData } = await supabase.from("project_sites").select("id, site_name").in("id", fromIds);
        (sitesData || []).forEach((s: any) => { smap[s.id] = s.site_name; });
      }
      if (cancelled) return;
      setPos(rows.map((r) => ({
        id: r.id,
        po_number: r.po_number,
        status: r.status,
        order_date: r.order_date,
        total_amount: Number(r.total_amount || 0),
        vendor_id: r.vendor_id,
        vendor_name: r.vendor_id ? vmap[r.vendor_id] || "" : "",
        source_type: r.source_type,
        transfer_from_site_id: r.transfer_from_site_id,
        transfer_from_name: r.transfer_from_site_id ? smap[r.transfer_from_site_id] || "" : "",
      })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [siteId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pos;
    return pos.filter((p) =>
      (p.po_number || "").toLowerCase().includes(q) ||
      p.vendor_name.toLowerCase().includes(q) ||
      p.status.toLowerCase().includes(q)
    );
  }, [pos, search]);

  const openPreview = async (po: OpenPO) => {
    setPreview({ po, lines: [], loading: true });
    const itemsRes: any = await (supabase.from("procurement_items") as any)
      .select("id, product_id, uom, qty, rate")
      .eq("procurement_id", po.id);
    const items = (itemsRes.data || []) as any[];
    const itemIds = items.map((i) => i.id);
    const prodIds = [...new Set(items.map((i) => i.product_id).filter(Boolean))];
    const pmap: Record<string, string> = {};
    if (prodIds.length) {
      // The column is product_name, not name. Asking for "name" made PostgREST
      // reject the query, which left every line showing a dash.
      const { data: prods, error: prodErr } = await supabase
        .from("master_products")
        .select("id, product_name")
        .in("id", prodIds);
      if (prodErr) console.error("Failed to load product names:", prodErr);
      (prods || []).forEach((p: any) => { pmap[p.id] = p.product_name; });
    }
    const grnRes: any = await (supabase.from("procurement_grns") as any).select("id").eq("po_id", po.id);
    const grnIds = ((grnRes.data || []) as any[]).map((g) => g.id);
    const recvByItem: Record<string, number> = {};
    if (grnIds.length && itemIds.length) {
      const giRes: any = await supabase
        .from("procurement_grn_items")
        .select("procurement_item_id, received_qty")
        .in("grn_id", grnIds);
      ((giRes.data || []) as any[]).forEach((gi) => {
        if (gi.procurement_item_id) recvByItem[gi.procurement_item_id] = (recvByItem[gi.procurement_item_id] || 0) + Number(gi.received_qty || 0);
      });
    }
    const lines: PreviewLine[] = items.map((it) => {
      const qty = Number(it.qty || 0);
      const received = Number(recvByItem[it.id] || 0);
      return {
        id: it.id,
        product_name: it.product_id ? pmap[it.product_id] || "—" : "—",
        uom: it.uom,
        qty,
        rate: Number(it.rate || 0),
        received,
        pending: Math.max(0, qty - received),
      };
    });
    setPreview({ po, lines, loading: false });
  };

  if (!siteId) {
    return (
      <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        Select a Site above to see open purchase orders awaiting goods receipt.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" />Open GRN — Purchase Orders to Receive *</Label>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search PO number, vendor, status..."
          className="h-9 pl-8"
        />
      </div>
      <div className="max-h-60 overflow-y-auto rounded-lg border divide-y">
        {loading ? (
          <p className="p-3 text-xs text-muted-foreground">Loading open POs...</p>
        ) : filtered.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">No open purchase orders for this site.</p>
        ) : filtered.map((p) => {
          const selected = value === p.id;
          return (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => onChange(selected ? "" : p.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onChange(selected ? "" : p.id);
                }
              }}
              className={`w-full cursor-pointer text-left p-2.5 flex items-center gap-2 transition-colors ${selected ? "bg-primary/10" : "hover:bg-muted/50"}`}
            >
              <div className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${selected ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                {selected && <Check className="h-3 w-3 text-primary-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-medium">{p.po_number || (p.source_type === "internal_transfer" ? "(No TRF #)" : "(No PO #)")}</span>
                  {p.source_type === "internal_transfer" && <Badge variant="outline" className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">Transfer</Badge>}
                  <Badge variant="outline" className={`text-[10px] ${statusColor(p.status)}`}>{p.status}</Badge>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); openPreview(p); }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openPreview(p);
                    }
                  }}
                  className="inline-block text-xs text-primary hover:underline mt-0.5 bg-transparent p-0 border-0 cursor-pointer"
                >
                  Read more
                </button>
                <div className="text-[11px] text-muted-foreground truncate">
                  {p.source_type === "internal_transfer"
                    ? `${p.order_date}${p.transfer_from_name ? ` · From ${p.transfer_from_name}` : ""}`
                    : `${p.order_date}${p.vendor_name ? ` · ${p.vendor_name}` : ""} · ${fmtAmt(p.total_amount)}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              {preview && (
                <a
                  href={`/procurement?po=${preview.po.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2 hover:opacity-80 inline-flex items-center gap-1"
                  title="Open full record"
                >
                  {preview.po.po_number || (preview.po.source_type === "internal_transfer" ? "(No TRF #)" : "(No PO #)")}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              {preview?.po.source_type === "internal_transfer" && (
                <Badge variant="outline" className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">Transfer</Badge>
              )}
              {preview && <Badge variant="outline" className={`text-[10px] ${statusColor(preview.po.status)}`}>{preview.po.status}</Badge>}
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-muted-foreground">Order Date:</span> <span className="font-medium">{preview.po.order_date}</span></div>
                {preview.po.source_type === "internal_transfer" ? (
                  <div><span className="text-muted-foreground">From Site:</span> <span className="font-medium">{preview.po.transfer_from_name || "—"}</span></div>
                ) : (
                  <>
                    <div><span className="text-muted-foreground">Vendor:</span> <span className="font-medium">{preview.po.vendor_name || "—"}</span></div>
                    <div><span className="text-muted-foreground">Total:</span> <span className="font-medium">{fmtAmt(preview.po.total_amount)}</span></div>
                  </>
                )}
              </div>
              <div>
                <h4 className="text-xs font-semibold mb-2">Line Items</h4>
                {preview.loading ? (
                  <p className="text-xs text-muted-foreground">Loading...</p>
                ) : preview.lines.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No line items.</p>
                ) : (
                  <div className="rounded-lg border overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-2 font-medium">Product</th>
                          <th className="text-right p-2 font-medium">Qty</th>
                          <th className="text-left p-2 font-medium">UOM</th>
                          <th className="text-right p-2 font-medium">Rate</th>
                          <th className="text-right p-2 font-medium">Received</th>
                          <th className="text-right p-2 font-medium">Pending</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.lines.map((l) => (
                          <tr key={l.id} className="border-t">
                            <td className="p-2">{l.product_name}</td>
                            <td className="p-2 text-right">{l.qty}</td>
                            <td className="p-2">{l.uom || "—"}</td>
                            <td className="p-2 text-right">{fmtAmt(l.rate)}</td>
                            <td className="p-2 text-right">{l.received}</td>
                            <td className="p-2 text-right font-medium">{l.pending}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
