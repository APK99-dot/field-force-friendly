import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Sparkles, RefreshCw, AlertTriangle, TrendingDown, Clock, Building2, IndianRupee, History } from "lucide-react";
import { fmtAmt } from "@/lib/procurement";
import { StarRating } from "@/components/procurement/VendorRating";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  poId: string;
  title?: string;
}

interface AdviceItem {
  product_id: string;
  product: string;
  recommended_vendor: string | null;
  vendor_rationale: string | null;
  alternate_vendor: string | null;
  target_rate: number | null;
  price_rationale: string | null;
  price_band: string | null;
  recommended_payment_terms: string | null;
  expected_lead_time_days: number | null;
  order_by_date: string | null;
  confidence: "high" | "medium" | "low" | string;
  watchouts?: string[];
}

interface Result {
  generated_at: string;
  history_records: number;
  requisition: Record<string, any>;
  analysis: any[];
  advice: {
    summary?: string;
    estimated_savings_note?: string | null;
    timing?: string;
    risks?: string[];
    items?: AdviceItem[];
  };
}

const confidenceClass = (c: string) =>
  c === "high"
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
    : c === "medium"
      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
      : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/** AI sourcing advisor — recommends vendor, price, terms and timing from past procurement history. */
export default function AiSourcingAdvisor({ open, onOpenChange, poId, title }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("ai-sourcing-advisor", {
        body: { po_id: poId },
      });
      if (fnErr) {
        // functions.invoke masks the real message — read it off the response body.
        let detail = fnErr.message;
        const ctx = (fnErr as any).context;
        if (ctx?.text) {
          try {
            const body = JSON.parse(await ctx.text());
            detail = body.error || detail;
          } catch { /* keep the generic message */ }
        }
        throw new Error(detail);
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data as Result);
    } catch (e: any) {
      setError(e.message || "Could not generate sourcing advice.");
    } finally {
      setLoading(false);
    }
  }, [poId]);

  useEffect(() => {
    if (open && !result && !loading) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poId]);

  const advice = result?.advice;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-screen h-screen sm:rounded-none p-0 gap-0 flex flex-col">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 flex-wrap text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Sourcing Advisor
            {title && <span className="text-xs font-normal text-muted-foreground">{title}</span>}
            {result && (
              <Badge variant="outline" className="text-[10px] ml-auto">
                {result.history_records} past purchase line{result.history_records === 1 ? "" : "s"} analysed
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 w-full max-w-5xl mx-auto">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <Sparkles className="h-8 w-8 text-primary animate-pulse" />
              <p className="text-sm font-medium">Analysing past procurement…</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                Reviewing historical rates, vendor performance, delivery lead times and feedback for every line item.
              </p>
            </div>
          )}

          {!loading && error && (
            <Card className="border-destructive/40">
              <CardContent className="py-6 text-center space-y-3">
                <AlertTriangle className="h-6 w-6 text-destructive mx-auto" />
                <p className="text-sm">{error}</p>
                <Button size="sm" variant="outline" onClick={run} className="gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" /> Try again
                </Button>
              </CardContent>
            </Card>
          )}

          {!loading && result && (
            <>
              {/* Executive summary */}
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="py-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <p className="text-sm leading-relaxed">{advice?.summary || "No summary available."}</p>
                  </div>
                  {advice?.estimated_savings_note && (
                    <div className="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                      <TrendingDown className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>{advice.estimated_savings_note}</span>
                    </div>
                  )}
                  {advice?.timing && (
                    <div className="flex items-start gap-2 text-sm">
                      <Clock className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <span>{advice.timing}</span>
                    </div>
                  )}
                  {!!advice?.risks?.length && (
                    <div className="space-y-1 pt-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Risks</p>
                      <ul className="list-disc pl-5 space-y-0.5 text-xs text-muted-foreground">
                        {advice.risks.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Per-item recommendations */}
              {(advice?.items || []).map((it) => {
                const stats = (result.analysis || []).find((a: any) => a.product_id === it.product_id);
                return (
                  <Card key={it.product_id || it.product}>
                    <CardContent className="py-4 space-y-3">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="text-sm font-semibold">{it.product}</p>
                          {stats && (
                            <p className="text-xs text-muted-foreground">
                              Requested {stats.requested_qty} {stats.requested_uom || ""} · {stats.history_count} past purchase{stats.history_count === 1 ? "" : "s"}
                            </p>
                          )}
                        </div>
                        <Badge className={cn("text-[10px]", confidenceClass(it.confidence))}>{it.confidence} confidence</Badge>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="rounded-lg border p-2.5 space-y-1">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" /> Right vendor</p>
                          <p className="text-sm font-semibold">{it.recommended_vendor || "No clear match"}</p>
                          {it.alternate_vendor && <p className="text-[11px] text-muted-foreground">Backup: {it.alternate_vendor}</p>}
                          {it.vendor_rationale && <p className="text-[11px] text-muted-foreground">{it.vendor_rationale}</p>}
                        </div>
                        <div className="rounded-lg border p-2.5 space-y-1">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><IndianRupee className="h-3 w-3" /> Right price</p>
                          <p className="text-sm font-semibold">{it.target_rate != null ? fmtAmt(it.target_rate) : (it.price_band || "—")}</p>
                          {it.price_band && it.target_rate != null && <p className="text-[11px] text-muted-foreground">Band: {it.price_band}</p>}
                          {it.price_rationale && <p className="text-[11px] text-muted-foreground">{it.price_rationale}</p>}
                        </div>
                        <div className="rounded-lg border p-2.5 space-y-1">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Right time & terms</p>
                          <p className="text-sm font-semibold">
                            {it.expected_lead_time_days != null ? `${it.expected_lead_time_days} days lead time` : "Lead time unknown"}
                          </p>
                          {it.order_by_date && <p className="text-[11px] text-muted-foreground">Order by {fmtDate(it.order_by_date)}</p>}
                          <p className="text-[11px] text-muted-foreground">Terms: {it.recommended_payment_terms || "—"}</p>
                        </div>
                      </div>

                      {!!it.watchouts?.length && (
                        <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                          {it.watchouts.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                      )}

                      {/* Evidence */}
                      {stats && (
                        <Accordion type="single" collapsible>
                          <AccordionItem value="evidence" className="border-b-0">
                            <AccordionTrigger className="py-2 text-xs hover:no-underline">
                              <span className="flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> Purchase history & vendor evidence</span>
                            </AccordionTrigger>
                            <AccordionContent className="space-y-3">
                              {stats.price ? (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                  {[
                                    { l: "Lowest paid", v: fmtAmt(stats.price.lowest) },
                                    { l: "Median", v: fmtAmt(stats.price.median) },
                                    { l: "Highest paid", v: fmtAmt(stats.price.highest) },
                                    { l: "Last paid", v: `${fmtAmt(stats.price.last_paid)} · ${fmtDate(stats.price.last_paid_on)}` },
                                  ].map((k) => (
                                    <div key={k.l} className="rounded-md bg-muted/50 p-2">
                                      <p className="text-[10px] text-muted-foreground">{k.l}</p>
                                      <p className="font-medium">{k.v}</p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground italic">No past purchases found for this product.</p>
                              )}

                              {!!stats.vendors?.length && (
                                <div className="space-y-1.5">
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Vendors used before</p>
                                  {stats.vendors.map((v: any) => (
                                    <div key={v.vendor_id} className="rounded-lg border p-2 text-[11px] space-y-1">
                                      <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <span className="font-medium text-xs">{v.vendor}</span>
                                        <span className="text-muted-foreground">{v.times_purchased}× · last {fmtDate(v.last_purchased)}</span>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                                        <span>Avg {fmtAmt(v.avg_rate)}</span>
                                        <span>Best {fmtAmt(v.best_rate)}</span>
                                        {v.avg_lead_time_days != null && <span>{v.avg_lead_time_days}d lead</span>}
                                        {v.on_time_pct != null && <span>{v.on_time_pct}% on-time</span>}
                                        {v.common_payment_terms && <span>{v.common_payment_terms}</span>}
                                      </div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {v.rating != null ? (
                                          <>
                                            <StarRating value={Math.round(v.rating)} readOnly size={12} />
                                            <span>{v.rating} ({v.reviews})</span>
                                          </>
                                        ) : (
                                          <span className="text-muted-foreground">Not rated</span>
                                        )}
                                        {v.negative_score != null && (
                                          <Badge variant="outline" className="text-[10px]">Negative score {v.negative_score}</Badge>
                                        )}
                                        {(v.improvement_areas || []).map((a: string) => (
                                          <Badge key={a} className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{a.replace(/_/g, " ")}</Badge>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {!!stats.other_sites?.length && (
                                <p className="text-[11px] text-muted-foreground">
                                  Also procured for: {stats.other_sites.join(", ")}
                                </p>
                              )}
                              {!!stats.buying_months?.length && (
                                <p className="text-[11px] text-muted-foreground">
                                  Usually bought in: {stats.buying_months.slice(0, 4).map((m: any) => `${m.month} (${m.count})`).join(", ")}
                                </p>
                              )}
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      )}
                    </CardContent>
                  </Card>
                );
              })}

              <div className="flex items-center justify-between gap-2 pt-2 pb-6 flex-wrap">
                <p className="text-[11px] text-muted-foreground">
                  Generated {new Date(result.generated_at).toLocaleString("en-GB")} · AI guidance based on your own purchase history. Verify before committing.
                </p>
                <Button size="sm" variant="outline" onClick={run} className="gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" /> Re-analyse
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
