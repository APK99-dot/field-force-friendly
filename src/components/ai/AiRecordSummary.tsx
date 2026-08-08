import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Sparkles, RefreshCw, AlertTriangle, Volume2, Pause, Loader2, TrendingUp,
  IndianRupee, ShieldAlert, ListChecks, Package, Truck, MessageSquareQuote,
  Activity as ActivityIcon, HelpCircle, Handshake, Target,
} from "lucide-react";
import { cn } from "@/lib/utils";

type RecordType = "project" | "vendor";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  type: RecordType;
  recordId: string;
  title?: string;
}

interface RiskItem { title: string; severity: string; detail?: string; mitigation?: string }
interface ActionItem { action: string; owner_hint?: string; urgency?: string }
interface Result {
  type: RecordType;
  generated_at: string;
  title?: string;
  facts: Record<string, any>;
  summary: Record<string, any>;
}

const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const healthTone = (h?: string) => {
  switch (h) {
    case "on_track":
    case "strong":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "at_risk":
    case "watch":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
    default:
      return "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300";
  }
};
const severityTone = (s?: string) =>
  s === "high"
    ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
    : s === "medium"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
const urgencyTone = (u?: string) =>
  u === "now"
    ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
    : u === "this_week"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
      : "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-base font-bold leading-tight mt-0.5">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function Section({
  icon: Icon, title, narrative, bullets, bulletLabel, tone,
}: {
  icon: any; title: string; narrative?: string; bullets?: string[]; bulletLabel?: string; tone?: string;
}) {
  if (!narrative && !bullets?.length) return null;
  return (
    <Card className="overflow-hidden">
      <div className={cn("h-1 w-full", tone || "bg-primary/60")} />
      <CardContent className="py-4 space-y-2.5">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">{title}</p>
        </div>
        {narrative && <p className="text-sm leading-relaxed text-muted-foreground">{narrative}</p>}
        {!!bullets?.length && (
          <div className="space-y-1 pt-0.5">
            {bulletLabel && <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{bulletLabel}</p>}
            <ul className="list-disc pl-5 space-y-0.5 text-xs">
              {bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * AI executive summary for a project/site or a vendor record, with an
 * optional spoken briefing generated from the model's audio script.
 */
export default function AiRecordSummary({ open, onOpenChange, type, recordId, title }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioSrcRef = useRef<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("ai-record-summary", {
        body: { type, id: recordId },
      });
      if (fnErr) {
        let detail = fnErr.message;
        const ctx = (fnErr as any).context;
        if (ctx?.text) {
          try { detail = JSON.parse(await ctx.text()).error || detail; } catch { /* keep generic */ }
        }
        throw new Error(detail);
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data as Result);
    } catch (e: any) {
      setError(e.message || "Could not generate the summary.");
    } finally {
      setLoading(false);
    }
  }, [type, recordId]);

  useEffect(() => {
    if (open && !result && !loading) run();
    if (!open) {
      audioRef.current?.pause();
      setPlaying(false);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    audioRef.current?.pause();
    if (audioSrcRef.current) URL.revokeObjectURL(audioSrcRef.current);
  }, []);

  const speak = async () => {
    if (playing) { audioRef.current?.pause(); setPlaying(false); return; }
    if (audioRef.current) { await audioRef.current.play(); setPlaying(true); return; }
    const script: string = result?.summary?.audio_script || result?.summary?.headline || "";
    if (!script) return;
    setAudioLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("speak-text", { body: { text: script } });
      if (fnErr) throw new Error(fnErr.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      const src = `data:${(data as any).mime || "audio/mpeg"};base64,${(data as any).audio}`;
      const audio = new Audio(src);
      audio.onended = () => setPlaying(false);
      audio.onpause = () => setPlaying(false);
      audioRef.current = audio;
      await audio.play();
      setPlaying(true);
    } catch (e: any) {
      setError(e.message || "Could not generate audio.");
    } finally {
      setAudioLoading(false);
    }
  };

  const regenerate = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
    setResult(null);
    run();
  };

  const s = result?.summary || {};
  const f = result?.facts || {};
  const risks: RiskItem[] = Array.isArray(s.risks) ? s.risks : [];
  const actions: ActionItem[] = Array.isArray(s.next_actions) ? s.next_actions : [];

  const stats = result
    ? type === "project"
      ? [
          { label: "Avg progress", value: `${f.avg_progress_pct ?? 0}%`, hint: f.time_elapsed_pct != null ? `${f.time_elapsed_pct}% of schedule elapsed` : undefined },
          { label: "Milestones", value: `${f.milestones_completed ?? 0}/${f.milestones_total ?? 0}`, hint: `${f.milestones_overdue ?? 0} overdue` },
          { label: "Activities", value: String(f.activities_total ?? 0), hint: `${f.activities_last_30d ?? 0} in last 30 days` },
          { label: "Committed spend", value: inr(f.committed_spend), hint: f.budget_estimated ? `vs ${inr(f.budget_estimated)} budget` : undefined },
          { label: "Invoiced", value: inr(f.invoiced), hint: `${inr(f.paid)} paid` },
          { label: "Outstanding", value: inr(f.outstanding), hint: `${f.purchase_orders ?? 0} orders` },
        ]
      : [
          { label: "Total spend", value: inr(f.total_spend), hint: `${f.orders_total ?? 0} orders` },
          { label: "Since", value: f.vendor_since || "—", hint: f.last_order_on ? `last order ${f.last_order_on}` : undefined },
          { label: "Products", value: String(f.distinct_products ?? 0), hint: `${f.sites_served ?? 0} sites served` },
          { label: "On-time", value: f.on_time_pct != null ? `${f.on_time_pct}%` : "—", hint: f.avg_lead_time_days != null ? `${f.avg_lead_time_days}d avg lead` : undefined },
          { label: "Avg rating", value: f.avg_rating != null ? `${f.avg_rating} / 5` : "—", hint: `${f.feedback_count ?? 0} feedback` },
          { label: "Risk score", value: f.negative_score != null ? `${f.negative_score}/100` : "—", hint: "lower is better" },
        ]
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[96vw] h-[92vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-4 sm:px-6 py-3 border-b bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Summary
            <span className="text-muted-foreground font-normal truncate">· {result?.title || title || (type === "project" ? "Project" : "Vendor")}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
              <Sparkles className="h-8 w-8 text-primary animate-pulse" />
              <p className="text-sm font-medium">Reading the full record…</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                {type === "project"
                  ? "Analysing milestones, field activity, procurement spend and risks."
                  : "Analysing order history, products, deliveries, invoices and feedback."}
              </p>
            </div>
          )}

          {!loading && error && (
            <Card className="border-destructive/40">
              <CardContent className="py-6 text-center space-y-3">
                <AlertTriangle className="h-6 w-6 text-destructive mx-auto" />
                <p className="text-sm">{error}</p>
                <Button size="sm" variant="outline" onClick={regenerate} className="gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" /> Try again
                </Button>
              </CardContent>
            </Card>
          )}

          {!loading && result && (
            <>
              {/* Headline */}
              <Card className="border-primary/30 bg-gradient-to-br from-primary/10 to-transparent">
                <CardContent className="py-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <p className="text-base font-semibold leading-snug flex-1 min-w-[220px]">{s.headline || "No summary available."}</p>
                    {s.health && (
                      <Badge className={cn("text-[10px] uppercase", healthTone(s.health))}>
                        {String(s.health).replace(/_/g, " ")}
                      </Badge>
                    )}
                  </div>
                  {s.health_reason && <p className="text-sm text-muted-foreground">{s.health_reason}</p>}
                  {type === "project" && f.avg_progress_pct != null && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>Progress</span><span>{f.avg_progress_pct}%</span>
                      </div>
                      <Progress value={Number(f.avg_progress_pct) || 0} className="h-2" />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" onClick={speak} disabled={audioLoading} className="gap-1.5">
                      {audioLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : playing ? <Pause className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                      {audioLoading ? "Preparing audio…" : playing ? "Pause" : "Listen to briefing"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={regenerate} className="gap-1.5">
                      <RefreshCw className="h-3.5 w-3.5" /> Regenerate
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Key numbers */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {stats.map((st) => <Stat key={st.label} {...st} />)}
              </div>

              {type === "project" ? (
                <>
                  <Section icon={TrendingUp} title="Overall progress" narrative={s.progress?.narrative} bullets={s.progress?.highlights} bulletLabel="Highlights" tone="bg-emerald-500/70" />
                  {!!s.progress?.blockers?.length && (
                    <Section icon={AlertTriangle} title="Blockers" bullets={s.progress.blockers} tone="bg-amber-500/70" />
                  )}
                  <Section icon={ActivityIcon} title="Activity summary" narrative={s.activity?.narrative} bullets={s.activity?.recent_themes} bulletLabel="Recent themes" tone="bg-sky-500/70" />
                  <Section icon={IndianRupee} title="Budget & spend" narrative={s.budget?.narrative} bullets={s.budget?.watchouts} bulletLabel="Watchouts" tone="bg-violet-500/70" />
                  {s.schedule_outlook && <Section icon={Target} title="Schedule outlook" narrative={s.schedule_outlook} tone="bg-indigo-500/70" />}
                  {s.vendor_exposure && <Section icon={Handshake} title="Vendor exposure" narrative={s.vendor_exposure} tone="bg-teal-500/70" />}
                </>
              ) : (
                <>
                  <Section icon={Handshake} title="Relationship history" narrative={s.relationship?.narrative} bullets={s.relationship?.milestones} bulletLabel="Notable moments" tone="bg-emerald-500/70" />
                  <Card className="overflow-hidden">
                    <div className="h-1 w-full bg-sky-500/70" />
                    <CardContent className="py-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-primary" />
                        <p className="text-sm font-semibold">Products supplied</p>
                      </div>
                      {s.products?.narrative && <p className="text-sm leading-relaxed text-muted-foreground">{s.products.narrative}</p>}
                      {!!s.products?.top_items?.length && (
                        <div className="space-y-1.5">
                          {s.products.top_items.map((it: any, i: number) => (
                            <div key={i} className="rounded-lg border p-2.5 text-xs">
                              <p className="font-medium text-sm">{it.product}</p>
                              <p className="text-muted-foreground">{[it.qty_note, it.rate_note].filter(Boolean).join(" · ")}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  <Section icon={IndianRupee} title="Commercials & payments" narrative={s.commercials?.narrative} bullets={s.commercials?.watchouts} bulletLabel="Watchouts" tone="bg-violet-500/70" />
                  <Section icon={Truck} title="Delivery reliability" narrative={s.delivery?.narrative} bullets={s.delivery?.watchouts} bulletLabel="Watchouts" tone="bg-amber-500/70" />
                  <Section icon={MessageSquareQuote} title="Feedback" narrative={s.feedback?.narrative} bullets={s.feedback?.recurring_issues} bulletLabel="Recurring issues" tone="bg-rose-500/70" />
                  {s.concentration && <Section icon={Target} title="Concentration & dependency" narrative={s.concentration} tone="bg-indigo-500/70" />}
                  {!!s.negotiation_levers?.length && (
                    <Section icon={ListChecks} title="Negotiation levers" bullets={s.negotiation_levers} tone="bg-teal-500/70" />
                  )}
                </>
              )}

              {/* Risks */}
              {!!risks.length && (
                <Card className="overflow-hidden">
                  <div className="h-1 w-full bg-rose-500/70" />
                  <CardContent className="py-4 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-primary" />
                      <p className="text-sm font-semibold">Risks</p>
                    </div>
                    {risks.map((r, i) => (
                      <div key={i} className="rounded-lg border p-2.5 space-y-1">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="text-sm font-medium">{r.title}</p>
                          <Badge className={cn("text-[10px] uppercase", severityTone(r.severity))}>{r.severity}</Badge>
                        </div>
                        {r.detail && <p className="text-xs text-muted-foreground">{r.detail}</p>}
                        {r.mitigation && <p className="text-xs text-emerald-700 dark:text-emerald-400">Mitigation: {r.mitigation}</p>}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Next actions */}
              {!!actions.length && (
                <Card className="overflow-hidden">
                  <div className="h-1 w-full bg-primary/70" />
                  <CardContent className="py-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <ListChecks className="h-4 w-4 text-primary" />
                      <p className="text-sm font-semibold">Recommended next actions</p>
                    </div>
                    {actions.map((a, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-lg border p-2.5">
                        <span className="mt-0.5 h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">{a.action}</p>
                          <div className="flex gap-2 flex-wrap mt-1">
                            {a.owner_hint && <Badge variant="outline" className="text-[10px]">{a.owner_hint}</Badge>}
                            {a.urgency && <Badge className={cn("text-[10px]", urgencyTone(a.urgency))}>{a.urgency.replace(/_/g, " ")}</Badge>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Review questions (project) */}
              {!!s.questions_to_ask?.length && (
                <Section icon={HelpCircle} title="Questions to ask in the next review" bullets={s.questions_to_ask} tone="bg-slate-400/70" />
              )}

              <p className="text-[10px] text-muted-foreground text-center pb-2">
                Generated {new Date(result.generated_at).toLocaleString()} from records in this app. Verify before acting.
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
