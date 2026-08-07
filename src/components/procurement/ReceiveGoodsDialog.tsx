import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import GRNForm, { type POItem } from "./GRNForm";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  poId: string;
  currentUserId?: string;
  onSaved?: () => void;
}

/** Loads a PO (items, products, already-received) and opens the GRN form to receive goods. */
export default function ReceiveGoodsDialog({ open, onOpenChange, poId, currentUserId, onSaved }: Props) {
  const [poNumber, setPoNumber] = useState("");
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<string | null>(null);
  const [transferFromName, setTransferFromName] = useState<string>("");
  const [items, setItems] = useState<POItem[]>([]);
  const [received, setReceived] = useState<Record<string, number>>({});
  const [products, setProducts] = useState<Record<string, string>>({});
  const [poVendors, setPoVendors] = useState<{ id: string; name: string }[]>([]);
  const [itemVendorMap, setItemVendorMap] = useState<Record<string, string[]>>({});
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    setReady(false);
    const { data: po } = await supabase
      .from("procurement_orders")
      .select("po_number, vendor_id, source_type, transfer_from_site_id, procurement_items(id, product_id, rate, qty, uom, vendor_ids, rate_source, rate_source_vendor_id)")
      .eq("id", poId)
      .single();
    const rawItems = ((po as any)?.procurement_items || []) as any[];
    const its: POItem[] = rawItems.map((it) => ({
      id: it.id, product_id: it.product_id, rate: Number(it.rate || 0), qty: Number(it.qty || 0), uom: it.uom,
    }));
    // "Selected/finalized" vendor for a line = the vendor whose quote (or adjusted quote)
    // was picked as the winner. Fall back to the sole assigned vendor when no winner
    // has been explicitly selected yet.
    const ivMap: Record<string, string[]> = {};
    const finalizedVendorSet = new Set<string>();
    rawItems.forEach((it) => {
      const assigned: string[] = Array.isArray(it.vendor_ids) ? it.vendor_ids.filter(Boolean) : [];
      const winner = (it.rate_source === "quote" || it.rate_source === "manual_adjusted")
        ? it.rate_source_vendor_id
        : null;
      const finalized = winner ? [winner] : (assigned.length === 1 ? assigned : []);
      ivMap[it.id] = finalized;
      finalized.forEach((v) => finalizedVendorSet.add(v));
    });
    setItemVendorMap(ivMap);

    setPoNumber((po as any)?.po_number || "(No PO #)");
    setVendorId((po as any)?.vendor_id || null);
    setSourceType((po as any)?.source_type || null);
    const fromId = (po as any)?.transfer_from_site_id || null;
    if (fromId) {
      const { data: site } = await supabase.from("project_sites").select("site_name").eq("id", fromId).single();
      setTransferFromName((site as any)?.site_name || "");
    } else {
      setTransferFromName("");
    }
    setItems(its);

    const productIds = [...new Set(its.filter((i) => i.product_id).map((i) => i.product_id as string))];
    if (productIds.length) {
      const { data: prods, error: prodErr } = await supabase
        .from("master_products")
        .select("id, product_name")
        .in("id", productIds);
      if (prodErr) console.error("Failed to load product names:", prodErr);
      const pmap: Record<string, string> = {};
      (prods || []).forEach((p: any) => { pmap[p.id] = p.product_name; });
      setProducts(pmap);
    }

    const vendorIds = [...finalizedVendorSet];
    if (vendorIds.length) {
      const { data: vs } = await supabase.from("vendors").select("id, name").in("id", vendorIds);
      setPoVendors((vs || []).map((v: any) => ({ id: v.id, name: v.name })));
    } else {
      setPoVendors([]);
    }

    const { data: grns } = await supabase
      .from("procurement_grns")
      .select("procurement_grn_items(procurement_item_id, received_qty)")
      .eq("po_id", poId);
    const rmap: Record<string, number> = {};
    ((grns || []) as any[]).forEach((g) => {
      (g.procurement_grn_items || []).forEach((gi: any) => {
        if (gi.procurement_item_id) rmap[gi.procurement_item_id] = (rmap[gi.procurement_item_id] || 0) + Number(gi.received_qty || 0);
      });
    });
    setReceived(rmap);
    setReady(true);
  }, [poId]);

  useEffect(() => { if (open && poId) load(); }, [open, poId, load]);

  const productName = useMemo(() => (id: string | null) => (id ? products[id] || "Product" : "Product"), [products]);

  if (!open || !ready) return null;

  const isTransfer = sourceType === "internal_transfer";

  return (
    <GRNForm
      open={open}
      onOpenChange={onOpenChange}
      poId={poId}
      poNumber={poNumber}
      vendorId={isTransfer ? null : vendorId}
      sourceType={sourceType}
      transferFromSiteName={isTransfer ? transferFromName : undefined}
      items={items}
      alreadyReceived={received}
      productName={productName}
      createdBy={currentUserId}
      poVendors={isTransfer ? undefined : poVendors}
      itemVendorMap={isTransfer ? undefined : itemVendorMap}
      onSaved={() => { onSaved?.(); }}
    />
  );
}
