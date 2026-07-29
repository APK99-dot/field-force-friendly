import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, Truck, Check } from "lucide-react";
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

export default function OpenGRNPicker({ siteId, value, onChange }: Props) {
  const [pos, setPos] = useState<OpenPO[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

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
        const itemsRes: any = await supabase.from("procurement_items").select("id, po_id, qty").in("po_id", poIds);
        const grnRes: any = await supabase.from("procurement_grns").select("id, po_id").in("po_id", poIds);
        const grnIds = ((grnRes.data || []) as any[]).map((g) => g.id);
        const grnPoById: Record<string, string> = {};
        ((grnRes.data || []) as any[]).forEach((g) => { grnPoById[g.id] = g.po_id; });
        let grnItemsData: any[] = [];
        if (grnIds.length) {
          const giRes: any = await supabase.from("procurement_grn_items").select("procurement_item_id, received_qty, grn_id").in("grn_id", grnIds);
          grnItemsData = (giRes.data || []) as any[];
        }
        const recvByItem: Record<string, number> = {};
        grnItemsData.forEach((gi) => {
          if (gi.procurement_item_id) recvByItem[gi.procurement_item_id] = (recvByItem[gi.procurement_item_id] || 0) + Number(gi.received_qty || 0);
        });
        const pendingByPo: Record<string, number> = {};
        ((itemsRes.data || []) as any[]).forEach((it) => {
          const pending = Number(it.qty || 0) - Number(recvByItem[it.id] || 0);
          pendingByPo[it.po_id] = (pendingByPo[it.po_id] || 0) + Math.max(0, pending);
        });
        rows = rows.filter((r) => (pendingByPo[r.id] || 0) > 0);
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
            <button
              type="button"
              key={p.id}
              onClick={() => onChange(selected ? "" : p.id)}
              className={`w-full text-left p-2.5 flex items-center gap-2 transition-colors ${selected ? "bg-primary/10" : "hover:bg-muted/50"}`}
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
                <div className="text-[11px] text-muted-foreground truncate">
                  {p.source_type === "internal_transfer"
                    ? `${p.order_date}${p.transfer_from_name ? ` · From ${p.transfer_from_name}` : ""}`
                    : `${p.order_date}${p.vendor_name ? ` · ${p.vendor_name}` : ""} · ${fmtAmt(p.total_amount)}`}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
