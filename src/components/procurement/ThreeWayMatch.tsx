import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Scale } from "lucide-react";
import { fmtAmt } from "@/lib/procurement";
import type { POItem } from "./GRNForm";

interface Props {
  items: POItem[];
  /** received qty keyed by procurement_item_id */
  received: Record<string, number>;
  /** invoiced rate keyed by procurement_item_id (latest) */
  invoicedRate: Record<string, number>;
  poTotal: number;
  invoiceTotal: number;
  productName: (id: string | null) => string;
}

export default function ThreeWayMatch({
  items, received, invoicedRate, poTotal, invoiceTotal, productName,
}: Props) {
  // Group ordered/received quantities by UOM so we don't sum apples + oranges.
  const uomGroups = items.reduce<Record<string, { ordered: number; received: number }>>(
    (acc, it) => {
      const uom = (it.uom || "unit").trim() || "unit";
      if (!acc[uom]) acc[uom] = { ordered: 0, received: 0 };
      acc[uom].ordered += Number(it.qty || 0);
      acc[uom].received += Number(received[it.id] || 0);
      return acc;
    },
    {}
  );
  const uomEntries = Object.entries(uomGroups);
  const qtyMatch = uomEntries.every(([, g]) => g.received >= g.ordered);
  const amtMatch = Math.abs(poTotal - invoiceTotal) < 0.01;
  const anyRateMismatch = items.some(
    (it) => invoicedRate[it.id] != null && invoicedRate[it.id] !== it.rate
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Scale className="h-4 w-4" />3-Way Match
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Per-UOM qty breakdown */}
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">
            Received vs Ordered (by UOM)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {uomEntries.map(([uom, g]) => {
              const ok = g.received >= g.ordered;
              return (
                <div
                  key={uom}
                  className={`rounded-lg border p-2 flex items-center justify-between ${ok ? "" : "border-amber-500"}`}
                >
                  <span className="text-xs text-muted-foreground">{uom}</span>
                  <span className="text-sm font-semibold">
                    {g.received} / {g.ordered}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg border p-2">
            <div className="text-[10px] text-muted-foreground">PO Total</div>
            <div className="text-sm font-semibold">{fmtAmt(poTotal)}</div>
          </div>
          <div className={`rounded-lg border p-2 ${amtMatch ? "" : "border-amber-500"}`}>
            <div className="text-[10px] text-muted-foreground">Invoice Amt</div>
            <div className="text-sm font-semibold">{fmtAmt(invoiceTotal)}</div>
          </div>
        </div>

        {/* Per-item rate comparison */}
        <div className="space-y-1">
          {items.map((it) => {
            const ir = invoicedRate[it.id];
            const mismatch = ir != null && ir !== it.rate;
            const uomLabel = it.uom ? ` ${it.uom}` : "";
            return (
              <div key={it.id} className="flex items-center justify-between text-xs py-1 border-b last:border-b-0 gap-2">
                <span className="truncate flex-1 min-w-0">
                  {productName(it.product_id)}
                  <span className="text-muted-foreground">
                    {" "}· {received[it.id] || 0}/{it.qty}{uomLabel}
                  </span>
                </span>
                <span className="text-muted-foreground shrink-0">PO {fmtAmt(it.rate)}</span>
                <span className={`shrink-0 ${mismatch ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                  Inv {ir != null ? fmtAmt(ir) : "—"}
                </span>
              </div>
            );
          })}
        </div>

        <div className="space-y-1.5 pt-1">
          <MatchRow ok={qtyMatch} okText="Quantities reconciled (per UOM)" badText="Received qty less than ordered for some UOM" />
          <MatchRow ok={amtMatch} okText="PO and invoice totals match" badText="PO total and invoice amount differ" />
          <MatchRow ok={!anyRateMismatch} okText="All rates match PO" badText="Invoice rate differs from PO rate" />
        </div>
      </CardContent>
    </Card>
  );
}

function MatchRow({ ok, okText, badText }: { ok: boolean; okText: string; badText: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
      )}
      <span className={ok ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400"}>
        {ok ? okText : badText}
      </span>
    </div>
  );
}
