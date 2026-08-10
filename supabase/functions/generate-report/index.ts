// generate-report — runs one report subscription for one reporting period.
//
// Ported from staging-quickapp's generate-report, rewritten against this app's
// schema and its existing notification infrastructure.
//
// What it does, per run:
//   1. Loads the subscription -> its report_definition -> the dataset row in
//      reportable_datasets, and calls the RPC named by reportable_datasets.source
//      with the fixed five-parameter contract:
//        get_<x>_report(p_layout text, p_rows text, p_columns text,
//                       p_values text[], p_filters jsonb) RETURNS SETOF jsonb
//   2. Renders an attachment (CSV or PDF) and uploads it to the private
//      `report-files` bucket, unless the format is summary_only.
//   3. Delivers to every recipient and appends one row per recipient to
//      report_delivery_log.
//
// Delivery model (unchanged from the source):
//   - Every run generates and delivers regardless of row count. An empty dataset
//     still produces a file (headers only) or a "No records for this period"
//     digest, still notifies, still writes a delivery-log row.
//   - report_delivery_log is APPEND-ONLY. Each run inserts a new row tagged with
//     trigger_type = 'scheduled' | 'manual'.
//   - Scheduled idempotency is enforced upstream by report-dispatcher against
//     report_subscriptions.last_scheduled_period_key. Manual runs never touch
//     that field and never suppress a scheduled slot.
//
// DELIVERY PATHS — deliberate deviations from the source:
//   * The source relied on a `notifications_push_dispatch` DB trigger to fan a
//     notification row out to push. This app has no such trigger for report
//     rows; it has the dispatch-notification edge function, which inserts the
//     in-app notification row AND sends Web Push + FCM in one call.
//     So:
//       push_to_phone = true  -> invoke dispatch-notification with
//                                { recipient_ids: [uid], title, message, type,
//                                  related_table, related_id }.
//                                That function performs the notifications INSERT
//                                itself, so this function does NOT also insert —
//                                doing both would put two bell rows on screen.
//       push_to_phone = false -> INSERT INTO public.notifications directly.
//     If the dispatch-notification call fails, we fall back to the direct insert
//     so the report still lands in-app, and record push_status = 'failed'.
//   * public.notifications in this database has NO `metadata` column (verified
//     against 20260227060215 and src/integrations/supabase/types.ts), so the
//     source's metadata blob is dropped. Everything it carried that matters for
//     auditing lives in report_delivery_log instead.
//   * No pdf_template / branding: report_subscriptions here has no pdf_template
//     column (phase 1 omitted it deliberately) and the PDF template designer is
//     out of scope.
//   * No preview mode: the inline PDF preview is out of scope for this phase, so
//     this function is service-role only.
//
// ATTACHMENT RENDERING:
//   attachment_format = 'excel'        -> UTF-8 CSV (BOM prefixed), uploaded as
//                                         .csv with text/csv. Excel opens it
//                                         natively. A genuine .xlsx needs a ZIP
//                                         + worksheet-XML writer.
//   attachment_format = 'pdf'          -> a branded, multi-page A4 portrait PDF
//                                         built with pdf-lib: company logo +
//                                         company_name header, a real table with
//                                         a repeated header row and alternating
//                                         row shading, page-numbered footer.
//   attachment_format = 'summary_only' -> no file at all; the digest goes in the
//                                         notification body.
//
// BRANDING: company_profile (company_name + logo_url) is read once per run. The
// logo is fetched over HTTP and embedded as PNG or JPEG. Every step of that path
// is best-effort — a missing, unreachable, or unsupported (e.g. WEBP/SVG) logo
// degrades to a text-only header and never fails the report.
//
// DEEP LINK: the push notification carries data.route = /my-reports?open=<id>,
// where <id> is THIS recipient's report_delivery_log row. Tapping the banner
// opens My Reports, which mints a fresh signed URL via sign-report-file. A
// signed URL is deliberately NOT put in the payload — those expire in 300s and a
// banner may be tapped hours later.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BUCKET = "report-files";

interface Period {
  key: string;
  label: string;
  date_from: string;
  date_to: string;
}

interface GenerateRequest {
  subscription_id?: string;
  period?: Period;
  mode?: "manual" | "scheduled";
  // Scheduled occurrence key (local date + fire_time). Stamped onto
  // report_subscriptions.last_scheduled_period_key for idempotency. Only present
  // for scheduled runs; manual runs never carry this.
  occurrence_key?: string | null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Service-role only. report-dispatcher is the sole caller.
    const auth = req.headers.get("Authorization") ?? "";
    if (auth !== `Bearer ${SERVICE_ROLE}`) {
      return json({ error: "Unauthorized" }, 401);
    }

    let body: GenerateRequest = {};
    try {
      body = (await req.json()) as GenerateRequest;
    } catch {
      body = {};
    }

    const { subscription_id, period } = body;
    if (!subscription_id || !period?.key || !period?.date_from || !period?.date_to) {
      return json({ error: "subscription_id and period required" }, 400);
    }
    const triggerType: "scheduled" | "manual" = body.mode === "manual" ? "manual" : "scheduled";

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // ---- Subscription / definition / dataset ---------------------------------
    // Columns verified against 20260730120000: report_subscriptions has no
    // pdf_template column in this database, so it is not selected.
    const { data: sub, error: subErr } = await admin
      .from("report_subscriptions")
      .select(
        "id, name, report_definition_id, recipient_user_ids, recipient_mode, attachment_format, push_to_phone, scope, cadence, period_basis, status",
      )
      .eq("id", subscription_id)
      .maybeSingle();
    if (subErr) {
      console.error("[generate-report] subscription lookup failed:", subErr);
      return json({ error: subErr.message }, 500);
    }
    if (!sub) return json({ error: "Subscription not found" }, 404);

    const { data: def, error: defErr } = await admin
      .from("report_definitions")
      .select("id, name, dataset_key, layout, config")
      .eq("id", sub.report_definition_id)
      .maybeSingle();
    if (defErr) {
      console.error("[generate-report] definition lookup failed:", defErr);
      return json({ error: defErr.message }, 500);
    }
    if (!def) return json({ error: "Definition not found" }, 404);

    // `source` is the name of the SETOF-jsonb RPC to call. No name mapping.
    const { data: dataset, error: dsErr } = await admin
      .from("reportable_datasets")
      .select("key, source")
      .eq("key", def.dataset_key)
      .maybeSingle();
    if (dsErr) {
      console.error("[generate-report] dataset lookup failed:", dsErr);
      return json({ error: dsErr.message }, 500);
    }
    if (!dataset?.source) return json({ error: "Dataset not found" }, 404);

    // ---- Recipients ----------------------------------------------------------
    const recipientMode: string = sub.recipient_mode ?? "named_users";
    let recipients: string[] = [];
    let scope: string = sub.scope ?? "shared";
    if (recipientMode === "all_managers") {
      const { data: mgrs, error: mErr } = await admin.rpc("report_all_managers");
      if (mErr) console.error("[generate-report] report_all_managers error:", mErr);
      recipients = ((mgrs ?? []) as Array<{ user_id: string }>)
        .map((m) => m.user_id)
        .filter(Boolean);
      // all_managers always means one report per manager's own tree.
      scope = "per_recipient";
    } else {
      recipients = (sub.recipient_user_ids ?? []) as string[];
    }
    recipients = Array.from(new Set(recipients.filter(Boolean)));

    const format: string = sub.attachment_format ?? "excel";
    const ext = format === "pdf" ? "pdf" : "csv";
    const contentType = format === "pdf" ? "application/pdf" : "text/csv";

    // Recipient display names, for the meta block on per-recipient files.
    const recipientNames = new Map<string, string>();
    if (recipients.length > 0) {
      const { data: profs, error: profErr } = await admin
        .from("profiles")
        .select("id, full_name, username")
        .in("id", recipients);
      if (profErr) console.error("[generate-report] profile lookup failed:", profErr);
      (profs ?? []).forEach((p: any) =>
        recipientNames.set(p.id, p.full_name || p.username || ""),
      );
    }

    const filtersLabel = filtersLabelFrom(def.config?.filters);

    // Company name + logo for the PDF header. Loaded once per run (and only when
    // a PDF is actually going to be produced), never fatal.
    const branding: Branding =
      format === "pdf"
        ? await loadBranding(admin)
        : { companyName: "Bharath Builders", logo: null };

    // ---- Shared scope: one dataset call, one file, reused by everyone --------
    // Always re-runs the RPC and always re-uploads (upsert), so late-arriving
    // data replaces an earlier, possibly empty, file for the same period.
    let sharedPath: string | null = null;
    let sharedDigest = "";
    let sharedRows: any[] = [];
    let sharedIsEmpty = false;
    if (scope === "shared" && recipients.length > 0) {
      sharedRows = await callDatasetRpc(admin, dataset.source, def, {
        date_from: period.date_from,
        date_to: period.date_to,
      });
      sharedIsEmpty = sharedRows.length === 0;
      sharedDigest = buildDigest(sub.name, period, sharedRows);
      if (format !== "summary_only") {
        const bytes = await renderFile(
          format,
          sub.name,
          period,
          sharedRows,
          { scopeLabel: "Shared", filtersLabel },
          branding,
        );
        const path = `${sub.id}/${period.key}/shared.${ext}`;
        const { error: upErr } = await admin.storage
          .from(BUCKET)
          .upload(path, bytes, { contentType, upsert: true });
        if (upErr) console.error("[generate-report] shared upload failed:", upErr);
        else sharedPath = path;
      }
    }

    // ---- Per-recipient delivery ---------------------------------------------
    const outcomes: Array<Record<string, unknown>> = [];

    for (const rid of recipients) {
      // The delivery-log id is minted here rather than by the database default,
      // because the push notification has to carry it and the push goes out
      // before the log row is written. report_delivery_log.id is a plain uuid
      // PK, so supplying it explicitly is equivalent to letting the default fire.
      const deliveryLogId = crypto.randomUUID();
      try {
        let path = sharedPath;
        let digest = sharedDigest;
        let rows = sharedRows;
        let isEmpty = sharedIsEmpty;

        if (scope === "per_recipient") {
          rows = await callDatasetRpc(admin, dataset.source, def, {
            date_from: period.date_from,
            date_to: period.date_to,
            // The RECIPIENT's user id, not the author's. The dataset functions
            // expand it to self + subordinates (or their sites).
            scope_user_id: rid,
          });
          isEmpty = rows.length === 0;
          digest = buildDigest(sub.name, period, rows);
          path = null;
          if (format !== "summary_only") {
            const bytes = await renderFile(
              format,
              sub.name,
              period,
              rows,
              {
                scopeLabel: "Per recipient",
                filtersLabel,
                recipientName: recipientNames.get(rid) || null,
              },
              branding,
            );
            const p = `${sub.id}/${period.key}/${rid}.${ext}`;
            const { error: upErr } = await admin.storage
              .from(BUCKET)
              .upload(p, bytes, { contentType, upsert: true });
            if (upErr) console.error("[generate-report] upload failed:", rid, upErr);
            else path = p;
          }
        }

        const bodyLine = isEmpty
          ? `${period.label} — No records for this period.`
          : `${period.label} — ${rows.length} row${rows.length === 1 ? "" : "s"}`;
        const message = format === "summary_only" ? digest.slice(0, 500) : bodyLine;

        const delivery = await deliverToRecipient(admin, {
          userId: rid,
          title: sub.name,
          message,
          subscriptionId: sub.id,
          pushToPhone: sub.push_to_phone === true,
          // Per-recipient, because the delivery-log row is per-recipient.
          route: `/my-reports?open=${deliveryLogId}`,
        });

        // Append-only log row (no upsert). Every run is recorded.
        // Columns verified against 20260730120000: subscription_id,
        // recipient_user_id, period, trigger_type, notification_id,
        // storage_path, in_app_status, push_status, error.
        const { error: logErr } = await admin.from("report_delivery_log").insert({
          id: deliveryLogId,
          subscription_id: sub.id,
          recipient_user_id: rid,
          period: period.key,
          trigger_type: triggerType,
          notification_id: delivery.notificationId,
          storage_path: path,
          in_app_status: delivery.delivered ? "delivered" : "failed",
          push_status: delivery.pushStatus,
          error: delivery.error ? String(delivery.error).slice(0, 500) : null,
        });
        if (logErr) console.error("[generate-report] delivery log insert failed:", logErr);

        outcomes.push({
          recipient: rid,
          notification_id: delivery.notificationId,
          push: delivery.pushStatus,
          delivered: delivery.delivered,
          empty: isEmpty,
        });
      } catch (e) {
        console.error("[generate-report] per-recipient error", rid, e);
        try {
          await admin.from("report_delivery_log").insert({
            id: deliveryLogId,
            subscription_id: sub.id,
            recipient_user_id: rid,
            period: period.key,
            trigger_type: triggerType,
            notification_id: null,
            storage_path: null,
            in_app_status: "failed",
            push_status: null,
            error: String(e).slice(0, 500),
          });
        } catch (_) {
          /* the run must not die because the log write died */
        }
        outcomes.push({ recipient: rid, error: String(e), delivered: false });
      }
    }

    const deliveredCount = outcomes.filter((o: any) => o.delivered === true).length;
    const emptyRun = outcomes.length > 0 && outcomes.every((o: any) => o.empty === true);

    // last_fired_at reflects the most recent run of EITHER kind (display only).
    // last_scheduled_fire_at / last_scheduled_period_key are set only for
    // scheduled runs, and last_scheduled_period_key stores the OCCURRENCE key
    // (local date + fire_time), never the reporting-period key — so changing
    // fire_time yields a new key and permits another same-day run.
    const updates: Record<string, unknown> = {};
    if (deliveredCount > 0) updates.last_fired_at = new Date().toISOString();
    if (triggerType === "scheduled" && deliveredCount > 0) {
      updates.last_scheduled_fire_at = new Date().toISOString();
      if (body.occurrence_key) updates.last_scheduled_period_key = body.occurrence_key;
    }
    if (Object.keys(updates).length > 0) {
      const { error: updErr } = await admin
        .from("report_subscriptions")
        .update(updates)
        .eq("id", sub.id);
      if (updErr) console.error("[generate-report] subscription stamp failed:", updErr);
    }

    return json({
      ok: true,
      recipients: outcomes.length,
      delivered: deliveredCount,
      empty: emptyRun,
      trigger_type: triggerType,
      outcomes,
    });
  } catch (e) {
    console.error("[generate-report] Unexpected error:", e);
    return json({ error: String(e) }, 500);
  }
});

// ---------------------------------------------------------------------------
// Dataset access
// ---------------------------------------------------------------------------

/**
 * Call the dataset RPC named by reportable_datasets.source, using the fixed
 * five-parameter contract documented in migration 20260730140000.
 *
 * config.rows is an array (tabular reports carry several column keys); the
 * contract passes a single text, so rows[0] / columns[0] are used, exactly as
 * the source did. The run's date window (and scope_user_id, when the scope is
 * per_recipient) is merged over the definition's own stored filters, so the
 * period always wins over whatever the wizard saved.
 */
async function callDatasetRpc(
  admin: any,
  source: string,
  def: any,
  runFilters: Record<string, unknown>,
): Promise<any[]> {
  const config = def.config ?? {};
  const rows = Array.isArray(config.rows) ? config.rows[0] : config.rows;
  const cols = Array.isArray(config.columns) ? config.columns[0] : config.columns;
  const values = Array.isArray(config.values)
    ? config.values.map((v: any) => (typeof v === "string" ? v : v?.key)).filter(Boolean)
    : [];
  const mergedFilters = { ...(config.filters ?? {}), ...runFilters };

  const { data, error } = await admin.rpc(source, {
    p_layout: def.layout,
    p_rows: rows ?? null,
    p_columns: cols ?? null,
    p_values: values,
    p_filters: mergedFilters,
  });
  if (error) throw error;
  return (data ?? []) as any[];
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

interface DeliveryResult {
  delivered: boolean;
  notificationId: string | null;
  pushStatus: string | null;
  error: string | null;
}

/**
 * One recipient, one notification.
 *
 * push on  -> dispatch-notification does the notifications INSERT *and* the
 *             Web Push / FCM send. We do not insert as well; that would show
 *             the report twice in the bell.
 * push off -> plain INSERT INTO public.notifications.
 *
 * Columns on public.notifications, verified: user_id, title, message, type,
 * is_read, related_table, related_id (uuid), created_at. There is no metadata
 * column in this database.
 */
async function deliverToRecipient(
  admin: any,
  args: {
    userId: string;
    title: string;
    message: string;
    subscriptionId: string;
    pushToPhone: boolean;
    /** In-app path the push banner should open. Sent to FCM as data.route. */
    route?: string | null;
  },
): Promise<DeliveryResult> {
  const notifRow = {
    user_id: args.userId,
    title: args.title,
    message: args.message,
    type: "report_delivery",
    related_table: "report_subscriptions",
    related_id: args.subscriptionId,
  };

  if (args.pushToPhone) {
    // Body shape taken verbatim from dispatch-notification's DispatchPayload.
    const { error: fnErr } = await admin.functions.invoke("dispatch-notification", {
      body: {
        recipient_ids: [args.userId],
        title: notifRow.title,
        message: notifRow.message,
        type: notifRow.type,
        related_table: notifRow.related_table,
        related_id: notifRow.related_id,
        // Optional on dispatch-notification; omitted callers are unaffected.
        ...(args.route ? { route: args.route } : {}),
      },
    });

    if (!fnErr) {
      return {
        delivered: true,
        notificationId: await findNotificationId(admin, args.userId, args.subscriptionId),
        pushStatus: "dispatched",
        error: null,
      };
    }

    // Push path failed — fall back to a direct insert so the recipient still
    // gets the report in the bell, and record that push did not go out.
    console.error("[generate-report] dispatch-notification failed:", fnErr);
    const { data: inserted, error: insErr } = await admin
      .from("notifications")
      .insert(notifRow)
      .select("id")
      .single();
    return {
      delivered: !insErr,
      notificationId: inserted?.id ?? null,
      pushStatus: "failed",
      error: insErr ? insErr.message : String((fnErr as any)?.message ?? fnErr),
    };
  }

  const { data: inserted, error: insErr } = await admin
    .from("notifications")
    .insert(notifRow)
    .select("id")
    .single();
  if (insErr) console.error("[generate-report] notification insert failed:", insErr);
  return {
    delivered: !insErr,
    notificationId: inserted?.id ?? null,
    pushStatus: insErr ? null : "skipped_push_off",
    error: insErr ? insErr.message : null,
  };
}

/**
 * dispatch-notification does not return the ids of the rows it inserted, so the
 * newest matching row is looked up for the delivery log. Best effort: a null
 * notification_id is a valid delivery-log value.
 */
async function findNotificationId(
  admin: any,
  userId: string,
  subscriptionId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("related_table", "report_subscriptions")
    .eq("related_id", subscriptionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[generate-report] notification id lookup failed:", error);
    return null;
  }
  return data?.id ?? null;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function buildDigest(name: string, period: { label: string }, rows: any[]): string {
  if (!rows || rows.length === 0) {
    return `${name} — ${period.label}\n\nNo records for this period.`;
  }
  const preview = rows.slice(0, 10);
  const keys = Object.keys(preview[0] ?? {});
  const header = keys.join(" | ");
  const lines = [
    `${name} — ${period.label}`,
    `Rows: ${rows.length}`,
    "",
    header,
    "-".repeat(header.length),
    ...preview.map((r) => keys.map((k) => cellText(r[k])).join(" | ")),
  ];
  if (rows.length > preview.length) {
    lines.push(`… (${rows.length - preview.length} more)`);
  }
  return lines.join("\n");
}

interface RenderOpts {
  scopeLabel?: string | null;
  filtersLabel?: string | null;
  recipientName?: string | null;
}

async function renderFile(
  format: string,
  name: string,
  period: Period,
  rows: any[],
  opts: RenderOpts,
  branding: Branding,
): Promise<Uint8Array> {
  if (format === "pdf") return await renderPdf(name, period, rows, opts, branding);
  return renderCsv(name, period, rows, opts);
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** ISO yyyy-mm-dd -> dd/mm/yyyy. Anything else passes through untouched. */
function fmtDMY(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s ?? "").trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

/**
 * The period line for the file header.
 *
 * A daily report's label is the ISO date, so the old format repeated it three
 * times: "Period: 2026-08-10 (2026-08-10 to 2026-08-10)". A single-day period
 * now prints the date once, and every date reads dd/mm/yyyy like the rest of
 * the app.
 */
function periodLine(period: Period): string {
  const from = fmtDMY(period.date_from);
  const to = fmtDMY(period.date_to);
  if (from === to) return `Period: ${from}`;
  return `Period: ${fmtDMY(period.label)} (${from} to ${to})`;
}

function metaLines(name: string, period: Period, opts: RenderOpts): string[] {
  const lines = [name, periodLine(period)];
  if (opts.recipientName) lines.push(`Recipient: ${opts.recipientName}`);
  if (opts.scopeLabel) lines.push(`Scope: ${opts.scopeLabel}`);
  if (opts.filtersLabel) lines.push(`Filters: ${opts.filtersLabel}`);
  return lines;
}

/** RFC 4180 CSV, BOM-prefixed so Excel picks up UTF-8 without prompting. */
function renderCsv(name: string, period: Period, rows: any[], opts: RenderOpts): Uint8Array {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const out: string[] = metaLines(name, period, opts).map((l) => esc(l));
  out.push("");
  if (rows.length > 0) {
    const keys = Object.keys(rows[0]);
    out.push(keys.map((k) => esc(k)).join(","));
    for (const r of rows) out.push(keys.map((k) => esc(cellText(r[k]))).join(","));
  } else {
    out.push(esc("No records for this period."));
  }
  const BOM = "\uFEFF";
  return new TextEncoder().encode(BOM + out.join("\r\n") + "\r\n");
}

// --- Branded PDF (pdf-lib) --------------------------------------------------
// A4 portrait, Helvetica / Helvetica-Bold (base-14, nothing to embed).
//
// Everything drawn is forced to printable ASCII first. The standard fonts are
// WinAnsi-encoded and pdf-lib THROWS on a codepoint it cannot encode, so an
// unlucky rupee sign or emoji coming out of a dataset would otherwise blow up
// the whole run.

const PDF_W = 595.28; // A4 portrait, points
const PDF_H = 841.89;
const PDF_MARGIN = 36;
const PDF_CONTENT_W = PDF_W - PDF_MARGIN * 2;

const PDF_BODY_SIZE = 8;
const PDF_HEAD_SIZE = 8;
const PDF_LINE_H = 9.5;
const PDF_CELL_PAD = 3;
const PDF_ROW_MIN_H = 14;
const PDF_HEADER_ROW_H = 16;
const PDF_FOOTER_H = 24;

const PDF_MAX_ROWS = 5000;
const PDF_MAX_COLS = 10; // portrait A4 cannot carry more legibly
const PDF_MAX_CELL_LINES = 2;
const PDF_MAX_CELL_CHARS = 160; // more than two lines can ever show
const PDF_MIN_COL_W = 52; // 10 columns x 52 still fits the 523pt content width
const PDF_MAX_COL_W = 210;

const PDF_INK = rgb(0.08, 0.12, 0.24);
const PDF_TEXT = rgb(0.16, 0.16, 0.16);
const PDF_MUTED = rgb(0.45, 0.45, 0.45);
const PDF_ZEBRA = rgb(0.957, 0.965, 0.98);
const PDF_RULE = rgb(0.78, 0.66, 0.31);
const PDF_WHITE = rgb(1, 1, 1);

function toAscii(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[^\x20-\x7E]/g, "?");
}

interface Logo {
  bytes: Uint8Array;
  kind: "png" | "jpg";
}

interface Branding {
  companyName: string;
  logo: Logo | null;
}

/**
 * company_profile is a single-row table in practice, but a stray extra row must
 * not cost us the logo, so the row that actually has one wins (same rule the
 * client-side report PDF uses).
 *
 * Never throws: branding is decoration, and a report with a plain text header is
 * infinitely better than no report.
 */
async function loadBranding(admin: any): Promise<Branding> {
  const fallback: Branding = { companyName: "Bharath Builders", logo: null };
  try {
    const { data, error } = await admin
      .from("company_profile")
      .select("company_name, logo_url")
      .limit(5);
    if (error) {
      console.error("[generate-report] company_profile lookup failed:", error);
      return fallback;
    }
    const rows = (data ?? []) as Array<{ company_name: string | null; logo_url: string | null }>;
    const row =
      rows.find((r) => typeof r.logo_url === "string" && r.logo_url.trim() !== "") ??
      rows[0] ??
      null;
    if (!row) return fallback;

    const companyName = (row.company_name || "").trim() || fallback.companyName;
    const logoUrl = (row.logo_url || "").trim();
    const logo = logoUrl ? await fetchLogo(logoUrl) : null;
    return { companyName, logo };
  } catch (e) {
    console.error("[generate-report] branding load threw:", e);
    return fallback;
  }
}

/**
 * Fetch logo_url and classify it as PNG or JPEG — content-type first, then the
 * URL extension, then the magic bytes. Anything else (WEBP and SVG are both
 * uploadable from the Company Profile screen) returns null, because pdf-lib can
 * only embed PNG and JPEG.
 */
async function fetchLogo(url: string): Promise<Logo | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[generate-report] logo fetch ${res.status} for ${url}`);
      return null;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0) return null;

    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    let kind: "png" | "jpg" | null = null;
    if (ct.includes("png")) kind = "png";
    else if (ct.includes("jpeg") || ct.includes("jpg")) kind = "jpg";

    if (!kind) {
      const path = url.split("?")[0].toLowerCase();
      if (path.endsWith(".png")) kind = "png";
      else if (path.endsWith(".jpg") || path.endsWith(".jpeg")) kind = "jpg";
    }
    if (!kind) {
      if (bytes[0] === 0x89 && bytes[1] === 0x50) kind = "png";
      else if (bytes[0] === 0xff && bytes[1] === 0xd8) kind = "jpg";
    }
    if (!kind) {
      console.warn(`[generate-report] unsupported logo type (${ct || "unknown"}) — skipping`);
      return null;
    }
    return { bytes, kind };
  } catch (e) {
    console.warn("[generate-report] logo fetch threw:", e);
    return null;
  }
}

/** Split `text` across at most `maxLines` lines that each fit `maxWidth`. */
function wrapCell(
  text: string,
  font: any,
  size: number,
  maxWidth: number,
  maxLines: number,
): string[] {
  if (text === "") return [""];
  const width = (s: string) => font.widthOfTextAtSize(s, size);

  /**
   * Hard-cut a single unbreakable run so it can never overflow its column.
   * Binary search rather than a character-at-a-time walk: this runs up to
   * rows x columns times per document.
   */
  const clip = (s: string, room: number): string => {
    if (width(s) <= room) return s;
    let lo = 0;
    let hi = s.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (width(`${s.slice(0, mid)}...`) <= room) lo = mid;
      else hi = mid - 1;
    }
    return `${s.slice(0, Math.max(1, lo))}...`;
  };

  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter((w) => w !== "")) {
    const candidate = line === "" ? word : `${line} ${word}`;
    if (width(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line !== "") lines.push(line);
    if (lines.length === maxLines) {
      // No room left — fold the remainder into the final line and clip it.
      const last = lines.pop() as string;
      lines.push(clip(`${last} ${word}`, maxWidth));
      return lines;
    }
    line = width(word) <= maxWidth ? word : clip(word, maxWidth);
  }
  if (line !== "") lines.push(line);
  return lines.length === 0 ? [""] : lines.slice(0, maxLines);
}

/**
 * Column widths from the MEASURED width of the widest thing each column has to
 * show (its header, or its longest cell), not from character counts — a date
 * column sized by character count lands a fraction of a point short and clips
 * every value in it. Clamped so no column collapses and none hogs the page, then
 * scaled so the row spans exactly the content width.
 */
function columnWidths(keys: string[], rows: any[], font: any, headFont: any): number[] {
  const desired = keys.map((k) => {
    // Longest by character count first (cheap), measured once (accurate).
    let longest = "";
    for (const r of rows) {
      const t = cellText(r[k]);
      if (t.length > longest.length) longest = t;
    }
    if (longest.length > 40) longest = longest.slice(0, 40);
    const w =
      Math.max(
        headFont.widthOfTextAtSize(toAscii(k), PDF_HEAD_SIZE),
        font.widthOfTextAtSize(toAscii(longest), PDF_BODY_SIZE),
      ) +
      PDF_CELL_PAD * 2;
    return Math.min(Math.max(w, PDF_MIN_COL_W), PDF_MAX_COL_W);
  });

  const total = desired.reduce((a, b) => a + b, 0);
  if (total <= 0) return keys.map(() => PDF_CONTENT_W / keys.length);
  if (Math.abs(total - PDF_CONTENT_W) < 0.01) return desired;

  // Room to spare: hand it out in proportion to what each column asked for.
  if (total < PDF_CONTENT_W) {
    const scale = PDF_CONTENT_W / total;
    return desired.map((w) => w * scale);
  }

  // Over budget: take the excess only off columns that sit above the minimum.
  const excess = total - PDF_CONTENT_W;
  const slack = desired.reduce((a, w) => a + Math.max(0, w - PDF_MIN_COL_W), 0);
  if (slack <= 0) return keys.map(() => PDF_CONTENT_W / keys.length);
  return desired.map((w) => w - (Math.max(0, w - PDF_MIN_COL_W) / slack) * excess);
}

async function renderPdf(
  name: string,
  period: Period,
  rows: any[],
  opts: RenderOpts,
  branding: Branding,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Embed the logo once, up front — a corrupt image must degrade the header,
  // not kill the document.
  let logoImage: any = null;
  if (branding.logo) {
    try {
      logoImage =
        branding.logo.kind === "png"
          ? await doc.embedPng(branding.logo.bytes)
          : await doc.embedJpg(branding.logo.bytes);
    } catch (e) {
      console.warn("[generate-report] logo embed failed — text-only header:", e);
      logoImage = null;
    }
  }

  const capped = rows.slice(0, PDF_MAX_ROWS);
  const allKeys = capped.length > 0 ? Object.keys(capped[0] ?? {}) : [];
  const keys = allKeys.slice(0, PDF_MAX_COLS);
  const hasTable = keys.length > 0;
  const widths = hasTable ? columnWidths(keys, capped, font, bold) : [];
  const colX: number[] = [];
  let acc = PDF_MARGIN;
  for (const w of widths) {
    colX.push(acc);
    acc += w;
  }

  const pages: any[] = [];
  let page: any = null;
  let y = 0;

  const newPage = () => {
    page = doc.addPage([PDF_W, PDF_H]);
    pages.push(page);
    y = PDF_H - PDF_MARGIN;
  };

  const text = (
    s: string,
    x: number,
    baseline: number,
    size: number,
    f: any,
    color: any,
  ) => {
    page.drawText(toAscii(s), { x, y: baseline, size, font: f, color });
  };

  newPage();

  // ---- Header: logo (left) + company name beside it ------------------------
  let headerTextX = PDF_MARGIN;
  let headerBottom = y - 24;
  if (logoImage) {
    const iw = Number(logoImage.width) || 0;
    const ih = Number(logoImage.height) || 0;
    if (iw > 0 && ih > 0) {
      const logoH = 38;
      const logoW = Math.min(110, (iw / ih) * logoH);
      page.drawImage(logoImage, {
        x: PDF_MARGIN,
        y: y - logoH,
        width: logoW,
        height: logoH,
      });
      headerTextX = PDF_MARGIN + logoW + 12;
      headerBottom = Math.min(headerBottom, y - logoH);
    }
  }
  text(branding.companyName, headerTextX, y - 20, 17, bold, PDF_INK);

  y = headerBottom - 8;
  page.drawRectangle({
    x: PDF_MARGIN,
    y,
    width: PDF_CONTENT_W,
    height: 1.2,
    color: PDF_RULE,
  });
  y -= 16;

  // ---- Report name + period + meta ----------------------------------------
  text(name, PDF_MARGIN, y, 13, bold, PDF_INK);
  y -= 15;
  text(periodLine(period), PDF_MARGIN, y, 9, font, PDF_TEXT);
  y -= 12;

  const meta: string[] = [];
  if (opts.recipientName) meta.push(`Recipient: ${opts.recipientName}`);
  if (opts.scopeLabel) meta.push(`Scope: ${opts.scopeLabel}`);
  if (opts.filtersLabel) meta.push(`Filters: ${opts.filtersLabel}`);
  meta.push(`Rows: ${rows.length}`);
  if (allKeys.length > keys.length) {
    meta.push(`Columns 1-${keys.length} of ${allKeys.length} (full set in the CSV export)`);
  }
  for (const line of wrapCell(meta.join("   |   "), font, 8.5, PDF_CONTENT_W, 3)) {
    text(line, PDF_MARGIN, y, 8.5, font, PDF_MUTED);
    y -= 11;
  }
  y -= 6;

  // ---- Table ---------------------------------------------------------------
  const drawTableHeader = () => {
    page.drawRectangle({
      x: PDF_MARGIN,
      y: y - PDF_HEADER_ROW_H,
      width: PDF_CONTENT_W,
      height: PDF_HEADER_ROW_H,
      color: PDF_INK,
    });
    keys.forEach((k, i) => {
      const label = wrapCell(k, bold, PDF_HEAD_SIZE, widths[i] - PDF_CELL_PAD * 2, 1)[0];
      text(
        label,
        colX[i] + PDF_CELL_PAD,
        y - PDF_HEADER_ROW_H + 5.5,
        PDF_HEAD_SIZE,
        bold,
        PDF_WHITE,
      );
    });
    y -= PDF_HEADER_ROW_H;
  };

  if (!hasTable) {
    text("No records for this period.", PDF_MARGIN, y, 10, font, PDF_TEXT);
    y -= 14;
  } else {
    drawTableHeader();

    capped.forEach((r, idx) => {
      const cells = keys.map((k, i) => {
        // Only two lines of a ~90pt column are ever shown, so there is no point
        // measuring a stringified JSON blob word by word. Cap first, wrap after.
        const raw = toAscii(cellText(r[k]));
        return wrapCell(
          raw.length > PDF_MAX_CELL_CHARS ? raw.slice(0, PDF_MAX_CELL_CHARS) : raw,
          font,
          PDF_BODY_SIZE,
          widths[i] - PDF_CELL_PAD * 2,
          PDF_MAX_CELL_LINES,
        );
      });
      const lineCount = cells.reduce((m, c) => Math.max(m, c.length), 1);
      const rowH = Math.max(PDF_ROW_MIN_H, lineCount * PDF_LINE_H + 5);

      if (y - rowH < PDF_MARGIN + PDF_FOOTER_H) {
        newPage();
        drawTableHeader();
      }

      if (idx % 2 === 1) {
        page.drawRectangle({
          x: PDF_MARGIN,
          y: y - rowH,
          width: PDF_CONTENT_W,
          height: rowH,
          color: PDF_ZEBRA,
        });
      }

      cells.forEach((lines, i) => {
        lines.forEach((line, li) => {
          text(
            line,
            colX[i] + PDF_CELL_PAD,
            y - 4 - PDF_BODY_SIZE - li * PDF_LINE_H,
            PDF_BODY_SIZE,
            font,
            PDF_TEXT,
          );
        });
      });
      y -= rowH;
    });

    if (rows.length > capped.length) {
      if (y - 14 < PDF_MARGIN + PDF_FOOTER_H) newPage();
      y -= 12;
      text(
        `... ${rows.length - capped.length} more row(s) omitted — see the CSV export.`,
        PDF_MARGIN,
        y,
        8,
        font,
        PDF_MUTED,
      );
    }
  }

  // ---- Footer on every page ------------------------------------------------
  const stamp = `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;
  pages.forEach((p, i) => {
    p.drawText(toAscii(`Generated: ${stamp}`), {
      x: PDF_MARGIN,
      y: PDF_MARGIN - 4,
      size: 7.5,
      font,
      color: PDF_MUTED,
    });
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, {
      x: PDF_W - PDF_MARGIN - font.widthOfTextAtSize(label, 7.5),
      y: PDF_MARGIN - 4,
      size: 7.5,
      font,
      color: PDF_MUTED,
    });
  });

  return await doc.save();
}

/** Human-readable summary of the definition's stored filters, for the header. */
function filtersLabelFrom(filters: any): string | null {
  if (!filters || typeof filters !== "object") return null;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(filters)) {
    if (v === null || v === undefined || v === "") continue;
    // report_variant selects the column set inside get_attendance_report. It is
    // plumbing, not a filter the reader chose, and printing it put
    // "report variant: check_in" on the face of every daily report.
    if (k === "scope_user_id" || k === "date_from" || k === "date_to") continue;
    if (k === "report_variant") continue;
    const label = k.replace(/_id$/, "").replace(/_/g, " ");
    const val = typeof v === "string" && v.length > 12 ? `${v.slice(0, 8)}…` : String(v);
    parts.push(`${label}: ${val}`);
  }
  return parts.length ? parts.join(", ") : null;
}
