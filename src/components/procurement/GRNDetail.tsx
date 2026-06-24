import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Truck } from "lucide-react";
import { statusColor } from "@/lib/procurement";
import { resolveGrnPhotoUrl } from "@/utils/grnPhotos";

interface GrnItemRow {
  id: string;
  product_id: string | null;
  ordered_qty: number;
  received_qty: number;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  grn: {
    id: string;
    grn_number: string | null;
    receipt_date: string;
    status: string;
    received_by: string | null;
    remarks: string | null;
    po_id: string;
    photos?: string[] | null;
    po?: { po_number: string | null; vendor_id: string | null; site_id?: string | null } | null;
  } | null;
  vendorName: string;
}

export default function GRNDetail({ open, onOpenChange, grn, vendorName }: Props) {
  const navigate = useNavigate();
  const [items, setItems] = useState<GrnItemRow[]>([]);
  const [products, setProducts] = useState<Record<string, string>>({});
  const [uoms, setUoms] = useState<Record<string, string>>({});
  const [siteName, setSiteName] = useState<string>("—");
  const [loading, setLoading] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !grn) return;
    let active = true;
    (async () => {
      setLoading(true);
      const [gi, pr, items, site] = await Promise.all([
        supabase
          .from("procurement_grn_items")
          .select("id, product_id, ordered_qty, received_qty")
          .eq("grn_id", grn.id),
        supabase.from("master_products").select("id, product_name"),
        supabase.from("procurement_items").select("product_id, uom").eq("procurement_id", grn.po_id),
        grn.po?.site_id
          ? supabase.from("project_sites").select("site_name").eq("id", grn.po.site_id).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);
      if (!active) return;
      setItems((gi.data || []) as GrnItemRow[]);
      const pmap: Record<string, string> = {};
      (pr.data || []).forEach((p: any) => { pmap[p.id] = p.product_name; });
      setProducts(pmap);
      const umap: Record<string, string> = {};
      (items.data || []).forEach((i: any) => { if (i.product_id) umap[i.product_id] = i.uom; });
      setUoms(umap);
      setSiteName((site.data as any)?.site_name || "—");
      setLoading(false);

      const paths = (grn.photos || []) as string[];
      if (paths.length) {
        const urls = await Promise.all(paths.map((p) => resolveGrnPhotoUrl(p)));
        if (active) setPhotoUrls(urls.filter(Boolean));
      } else {
        setPhotoUrls([]);
      }
    })();
    return () => { active = false; };
  }, [open, grn]);

  if (!grn) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-screen h-screen sm:rounded-none p-0 gap-0 flex flex-col">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-4 w-4" />{grn.grn_number || "Goods Receipt"}
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusColor(grn.status)}`}>{grn.status}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 p-4 overflow-y-auto flex-1 max-w-3xl w-full mx-auto">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border p-3 bg-muted/30 text-sm">
            <div>
              <div className="text-[10px] text-muted-foreground">PO Number</div>
              {grn.po?.po_number ? (
                <button
                  type="button"
                  className="text-primary font-medium underline underline-offset-2 hover:opacity-80"
                  onClick={() => { onOpenChange(false); navigate(`/procurement?po=${grn.po_id}`); }}
                >
                  {grn.po.po_number}
                </button>
              ) : "—"}
            </div>
            <div><div className="text-[10px] text-muted-foreground">Receipt Date</div>{grn.receipt_date}</div>
            <div><div className="text-[10px] text-muted-foreground">Vendor</div>{vendorName || "—"}</div>
            <div><div className="text-[10px] text-muted-foreground">Site</div>{siteName}</div>
            <div><div className="text-[10px] text-muted-foreground">Received By</div>{grn.received_by || "—"}</div>
            <div><div className="text-[10px] text-muted-foreground">Status</div>{grn.status}</div>
          </div>

          <div>
            <div className="text-sm font-semibold mb-2">Items — Ordered vs Received</div>
            {loading ? (
              <div className="flex justify-center py-8"><div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
            ) : items.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">No line items recorded.</div>
            ) : (
              <div className="space-y-2">
                {items.map((it) => {
                  const uom = it.product_id ? uoms[it.product_id] : "";
                  const short = it.received_qty < it.ordered_qty;
                  return (
                    <div key={it.id} className="rounded-lg border p-2.5">
                      <div className="text-sm font-medium mb-1.5">{it.product_id ? (products[it.product_id] || "—") : "—"}</div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div><div className="text-[10px] text-muted-foreground">Ordered ({uom || "—"})</div>{it.ordered_qty}</div>
                        <div><div className="text-[10px] text-muted-foreground">Received</div>{it.received_qty}</div>
                        <div>
                          <div className="text-[10px] text-muted-foreground">Balance</div>
                          <span className={short ? "text-amber-600 font-medium" : ""}>{Math.max(0, it.ordered_qty - it.received_qty)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {grn.remarks && (
            <div>
              <div className="text-[10px] text-muted-foreground">Remarks</div>
              <p className="text-sm">{grn.remarks}</p>
            </div>
          )}

          {photoUrls.length > 0 && (
            <div>
              <div className="text-sm font-semibold mb-2">Goods Photos — Proof of Delivery</div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {photoUrls.map((url, idx) => (
                  <a
                    key={idx}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="block aspect-square rounded-lg overflow-hidden border"
                  >
                    <img src={url} alt={`Goods photo ${idx + 1}`} className="w-full h-full object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
