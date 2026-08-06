import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  X,
} from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";

/**
 * My Reports — every scheduled report actually delivered to the signed-in user.
 *
 * Reads public.report_delivery_log filtered to the caller's own rows. RLS policy
 * "Recipients can read own delivery log" (auth.uid() = recipient_user_id) is what
 * makes this work for non-admins; there is deliberately NO admin gate here.
 *
 * Downloads go through the sign-report-file edge function, which mints a 300s
 * signed URL for the private `report-files` bucket after re-checking entitlement
 * server-side. Request body is exactly { subscription_id, storage_path }; the
 * success response is { url, expires_in }.
 *
 * A failed read must never render as "No reports delivered yet." — an empty list
 * standing in for an error caused a production outage in this repo, so the query
 * error is surfaced as a toast plus a visible banner and the empty state is only
 * reachable when the request genuinely succeeded with zero rows.
 *
 * DEEP LINK: generate-report sends the push banner with data.route =
 * "/my-reports?open=<report_delivery_log.id>", and usePushNotifications
 * navigates here. `?open=` makes this page mint a fresh signed URL for that one
 * row and open it, once. The id is carried instead of a signed URL on purpose —
 * signed URLs live 300s, and a banner can be tapped hours later.
 */

interface DeliveryRow {
  id: string;
  subscription_id: string | null;
  period: string;
  trigger_type: string | null;
  storage_path: string | null;
  in_app_status: string | null;
  push_status: string | null;
  error: string | null;
  created_at: string;
  report_subscriptions: { name: string | null } | null;
}

const errText = (e: unknown, fallback: string) => (e as any)?.message || fallback;

/** supabase-js swallows a non-2xx edge-function body into FunctionsHttpError. */
async function edgeErrorDetail(error: unknown): Promise<string> {
  try {
    const ctx = (error as any)?.context;
    if (ctx && typeof ctx.json === "function") {
      const parsed = await ctx.json();
      if (parsed?.error) return String(parsed.error);
    }
  } catch {
    /* fall through to the generic message */
  }
  return errText(error, "Could not prepare this download");
}

/** Why a row has no file, phrased for the recipient. */
function unavailableReason(row: DeliveryRow): string {
  if (row.error) return "Run failed";
  if (!row.subscription_id) return "Subscription deleted";
  return "Summary only — no file";
}

export default function MyReports() {
  const { userId, isLoading: userLoading } = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  // Set when window.open is blocked (an auto-open from a push tap is not a user
  // gesture, so the WebView can refuse it). Without this the report would just
  // silently fail to appear.
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);

  const {
    data: deliveries = [],
    isLoading,
    error: deliveriesError,
  } = useQuery({
    queryKey: ["my-report-deliveries", userId],
    enabled: !!userId,
    queryFn: async (): Promise<DeliveryRow[]> => {
      const { data, error } = await supabase
        .from("report_delivery_log" as any)
        .select(
          "id, subscription_id, period, trigger_type, storage_path, in_app_status, push_status, error, created_at, report_subscriptions(name)"
        )
        .eq("recipient_user_id", userId as string)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data ?? []) as unknown as DeliveryRow[];
    },
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (deliveriesError) {
      toast.error(errText(deliveriesError, "Could not load your delivered reports"));
    }
  }, [deliveriesError]);

  const handleDownload = useCallback(async (row: DeliveryRow) => {
    if (!row.subscription_id || !row.storage_path) return;
    setDownloadError(null);
    setBlockedUrl(null);
    setDownloadingId(row.id);
    try {
      const { data, error } = await supabase.functions.invoke("sign-report-file", {
        body: {
          subscription_id: row.subscription_id,
          storage_path: row.storage_path,
        },
      });

      if (error) throw new Error(await edgeErrorDetail(error));
      if ((data as any)?.error) throw new Error(String((data as any).error));

      const url = (data as any)?.url;
      if (!url) throw new Error("No download link was returned for this report");

      const opened = window.open(url, "_blank");
      if (!opened) setBlockedUrl(url as string);
    } catch (e) {
      const msg = errText(e, "Could not prepare this download");
      setDownloadError(msg);
      toast.error(msg);
    } finally {
      setDownloadingId(null);
    }
  }, []);

  // While the user id is still unknown the query is disabled and React Query
  // reports pending, so treat that as loading rather than letting the empty
  // state claim there are no reports.
  const busy = userLoading || !userId || isLoading;

  // ---- Push deep link: ?open=<report_delivery_log.id> ----------------------
  // Fires at most once per id. The param is cleared afterwards so a refresh or
  // a back-navigation does not re-download the same report.
  const openId = searchParams.get("open");
  const autoOpenedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!openId || busy || deliveriesError) return;
    if (autoOpenedRef.current === openId) return;
    autoOpenedRef.current = openId;

    const row = deliveries.find((d) => d.id === openId);
    setSearchParams({}, { replace: true });

    if (!row) {
      toast.error("That report is not in your list — showing all your reports instead.");
      return;
    }
    if (!row.storage_path || !row.subscription_id) {
      toast.info(`No file for this report — ${unavailableReason(row).toLowerCase()}.`);
      return;
    }
    void handleDownload(row);
  }, [openId, busy, deliveriesError, deliveries, handleDownload, setSearchParams]);

  return (
    <div className="p-4 pb-24 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground">My Reports</h1>
        {!deliveriesError && !busy && (
          <Badge variant="secondary" className="ml-auto text-xs">
            {deliveries.length} report{deliveries.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {blockedUrl && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 flex items-start gap-3">
          <FileText size={18} className="text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-sm">
            <p className="font-medium text-foreground">Your report is ready</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              The browser blocked the automatic open. Tap below to view it.
            </p>
            <a
              href={blockedUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setBlockedUrl(null)}
              className="inline-flex items-center gap-1.5 mt-2 text-sm font-medium text-primary underline"
            >
              <Download className="h-4 w-4" />
              Open report
            </a>
          </div>
          <button
            type="button"
            onClick={() => setBlockedUrl(null)}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {downloadError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-sm">
            <p className="font-medium text-destructive">Download failed</p>
            <p className="text-xs text-muted-foreground mt-0.5 break-words">{downloadError}</p>
          </div>
          <button
            type="button"
            onClick={() => setDownloadError(null)}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Dismiss error"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {deliveriesError ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-sm">
            <p className="font-medium text-destructive">Could not load your delivered reports</p>
            <p className="text-xs text-muted-foreground mt-0.5 break-words">
              {errText(deliveriesError, "Unknown error")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              This is an error, not an empty list — your reports may still exist.
            </p>
          </div>
        </div>
      ) : busy ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card"
            >
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-9 w-24 rounded-lg" />
            </div>
          ))}
        </div>
      ) : deliveries.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No reports delivered yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {deliveries.map((row) => {
            const canDownload = !!row.storage_path && !!row.subscription_id;
            const isDownloading = downloadingId === row.id;

            return (
              <div
                key={row.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {row.report_subscriptions?.name || "Untitled report"}
                    </span>
                    {row.trigger_type === "manual" && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                        Manual
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-muted-foreground truncate">{row.period}</span>
                    <span className="text-muted-foreground text-xs">•</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(row.created_at), "d MMM yyyy, h:mm a")}
                    </span>
                  </div>
                  {!canDownload && (
                    <p className="text-xs text-muted-foreground/80 mt-0.5 break-words">
                      {unavailableReason(row)}
                      {row.error ? ` — ${row.error}` : ""}
                    </p>
                  )}
                </div>

                {canDownload ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={isDownloading}
                    onClick={() => handleDownload(row)}
                  >
                    {isDownloading ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-1.5" />
                    )}
                    {isDownloading ? "Preparing" : "Download"}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled
                    title={unavailableReason(row)}
                  >
                    <Download className="h-4 w-4 mr-1.5" />
                    No file
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
