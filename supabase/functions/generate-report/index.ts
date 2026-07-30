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
// ATTACHMENT RENDERING — no third-party imports. The source used npm:exceljs to
// emit a real .xlsx and a bespoke pdf-renderer module. Neither is available
// here, so:
//   attachment_format = 'excel'        -> UTF-8 CSV (BOM prefixed), uploaded as
//                                         .csv with text/csv. Excel opens it
//                                         natively. A genuine .xlsx needs a ZIP
//                                         + worksheet-XML writer.
//   attachment_format = 'pdf'          -> a minimal, self-contained PDF 1.4
//                                         written below (Courier, landscape A4).
//   attachment_format = 'summary_only' -> no file at all; the digest goes in the
//                                         notification body.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
        const bytes = renderFile(format, sub.name, period, sharedRows, {
          scopeLabel: "Shared",
          filtersLabel,
        });
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
            const bytes = renderFile(format, sub.name, period, rows, {
              scopeLabel: "Per recipient",
              filtersLabel,
              recipientName: recipientNames.get(rid) || null,
            });
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
        });

        // Append-only log row (no upsert). Every run is recorded.
        // Columns verified against 20260730120000: subscription_id,
        // recipient_user_id, period, trigger_type, notification_id,
        // storage_path, in_app_status, push_status, error.
        const { error: logErr } = await admin.from("report_delivery_log").insert({
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

function renderFile(
  format: string,
  name: string,
  period: Period,
  rows: any[],
  opts: RenderOpts,
): Uint8Array {
  if (format === "pdf") return renderPdf(name, period, rows, opts);
  return renderCsv(name, period, rows, opts);
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function metaLines(name: string, period: Period, opts: RenderOpts): string[] {
  const lines = [name, `Period: ${period.label} (${period.date_from} to ${period.date_to})`];
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

// --- Minimal PDF 1.4 writer -------------------------------------------------
// Courier (a base-14 font, so nothing needs embedding) on landscape A4. Because
// the font is monospaced, padding each cell to a fixed width is enough to line
// the columns up. Everything is forced to printable ASCII so that string length
// equals byte length, which is what makes the xref byte offsets below correct.

const PDF_W = 842;
const PDF_H = 595;
const PDF_MARGIN = 36;
const PDF_FONT_SIZE = 8;
const PDF_LINE_HEIGHT = 10;
const PDF_MAX_CHARS = 158; // (842 - 72) / (8 * 0.6) rounded down
const PDF_LINES_PER_PAGE = 50;
const PDF_MAX_ROWS = 5000;

function toAscii(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[^\x20-\x7E]/g, "?");
}

function pdfEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function tableLines(rows: any[]): string[] {
  if (rows.length === 0) return ["No records for this period."];
  const capped = rows.slice(0, PDF_MAX_ROWS);
  const keys = Object.keys(capped[0] ?? {});
  if (keys.length === 0) return ["No records for this period."];

  const widths = keys.map((k) => {
    let w = k.length;
    for (const r of capped) {
      const len = cellText(r[k]).length;
      if (len > w) w = len;
    }
    return Math.min(Math.max(w, 3), 24);
  });

  const fmt = (vals: string[]) =>
    vals
      .map((v, i) => (v.length > widths[i] ? v.slice(0, widths[i]) : v.padEnd(widths[i])))
      .join("  ")
      .slice(0, PDF_MAX_CHARS);

  const lines = [fmt(keys), fmt(widths.map((w) => "-".repeat(w)))];
  for (const r of capped) lines.push(fmt(keys.map((k) => cellText(r[k]))));
  if (rows.length > capped.length) {
    lines.push(`... (${rows.length - capped.length} more rows omitted)`);
  }
  return lines;
}

function renderPdf(name: string, period: Period, rows: any[], opts: RenderOpts): Uint8Array {
  const all = [...metaLines(name, period, opts), "", ...tableLines(rows)];

  const pages: string[][] = [];
  for (let i = 0; i < all.length; i += PDF_LINES_PER_PAGE) {
    pages.push(all.slice(i, i + PDF_LINES_PER_PAGE));
  }
  if (pages.length === 0) pages.push([name]);

  // Object ids: 1 catalog, 2 pages, 3 font, then (page, contents) pairs.
  const objs: Array<{ id: number; body: string }> = [];
  const kids: string[] = [];
  for (let i = 0; i < pages.length; i++) kids.push(`${4 + 2 * i} 0 R`);

  objs.push({ id: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" });
  objs.push({
    id: 2,
    body: `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`,
  });
  objs.push({
    id: 3,
    body: "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
  });

  for (let i = 0; i < pages.length; i++) {
    const pageId = 4 + 2 * i;
    const contentId = 5 + 2 * i;
    objs.push({
      id: pageId,
      body:
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_W} ${PDF_H}] ` +
        `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
    });
    let stream = `BT /F1 ${PDF_FONT_SIZE} Tf ${PDF_LINE_HEIGHT} TL ${PDF_MARGIN} ${PDF_H - PDF_MARGIN} Td\n`;
    for (const line of pages[i]) {
      stream += `(${pdfEscape(toAscii(line))}) Tj T*\n`;
    }
    stream += "ET";
    objs.push({
      id: contentId,
      body: `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    });
  }

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const o of objs) {
    offsets[o.id] = out.length;
    out += `${o.id} 0 obj\n${o.body}\nendobj\n`;
  }
  const xrefPos = out.length;
  const size = objs.length + 1;
  out += `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let id = 1; id < size; id++) {
    out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;

  return new TextEncoder().encode(out);
}

/** Human-readable summary of the definition's stored filters, for the header. */
function filtersLabelFrom(filters: any): string | null {
  if (!filters || typeof filters !== "object") return null;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(filters)) {
    if (v === null || v === undefined || v === "") continue;
    if (k === "scope_user_id" || k === "date_from" || k === "date_to") continue;
    const label = k.replace(/_id$/, "").replace(/_/g, " ");
    const val = typeof v === "string" && v.length > 12 ? `${v.slice(0, 8)}…` : String(v);
    parts.push(`${label}: ${val}`);
  }
  return parts.length ? parts.join(", ") : null;
}
