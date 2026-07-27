import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Scheduled backup mirror: pushes row upserts from this project to the
// external backup Supabase project as builders_* tables.
//
// Invoked by pg_cron (pg_net) on weekdays at 13:00 and 18:00 IST.
// Strictly one-way: this project -> external project.

const EXTERNAL_URL = "https://ylvhhlykyojudldcmzou.supabase.co";
const SERVICE_KEY = Deno.env.get("BACKUP_MIRROR_SERVICE_KEY") ?? "";
const SOURCE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SOURCE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const PAGE_SIZE = 500;
const EPOCH = "1970-01-01T00:00:00Z";

type TableSpec = { changeKey: string; columns: string[]; full?: boolean };

// Allowlist of columns to mirror per table. Extras are stripped so the
// external table only needs these columns.
const TABLES: Record<string, TableSpec> = {
  users: {
    changeKey: "updated_at",
    columns: [
      "id", "email", "full_name", "username", "role_id",
      "reporting_manager_id", "phone", "is_active", "created_at", "updated_at",
    ],
  },
  employees: {
    changeKey: "updated_at",
    columns: [
      "id", "user_id", "monthly_salary", "daily_da_allowance", "manager_id",
      "secondary_manager_id", "hq", "date_of_joining", "date_of_exit",
      "alternate_email", "address", "education", "emergency_contact_number",
      "photo_url", "band", "created_at", "updated_at",
    ],
  },
  attendance: {
    changeKey: "updated_at",
    columns: [
      "id", "user_id", "check_in_time", "check_out_time", "check_in_location",
      "check_out_location", "check_in_photo_url", "check_out_photo_url",
      "check_in_address", "check_out_address", "status", "total_hours", "date",
      "face_verification_status", "face_match_confidence",
      "face_verification_status_out", "face_match_confidence_out", "notes",
      "regularized_request_id", "created_at", "updated_at",
    ],
  },
  profiles: {
    changeKey: "updated_at",
    columns: [
      "id", "username", "full_name", "phone_number", "recovery_email",
      "hint_question", "hint_answer", "profile_picture_url", "user_status",
      "onboarding_completed", "must_change_password", "created_at", "updated_at",
    ],
  },
  user_roles: {
    changeKey: "assigned_at",
    columns: ["id", "user_id", "role", "assigned_at"],
  },
  leave_applications: {
    changeKey: "updated_at",
    columns: [
      "id", "user_id", "leave_type_id", "from_date", "to_date", "total_days",
      "reason", "status", "approved_by", "approved_at", "applied_date",
      "approved_date", "is_half_day", "half_day_period", "created_at", "updated_at",
    ],
  },

  // ---- phase 2 (additive): GPS, Activity module, Sites, Procurement ----
  // Tables flagged `full: true` have no updated_at column, so a watermark on
  // created_at would miss later edits. They are small, so every run re-reads
  // and upserts all rows by primary key.
  activity_events: {
    changeKey: "created_at",
    full: true,
    columns: [
      "id", "user_id", "activity_type", "activity_name", "activity_date",
      "duration_type", "start_time", "end_time", "from_date", "to_date",
      "total_days", "half_day_type", "remarks", "retailer_id", "visit_id",
      "created_at", "description", "status", "project_id", "location_lat",
      "location_lng", "location_address", "attachment_urls", "total_hours",
      "site_id", "status_changed_at", "status_change_lat", "status_change_lng",
      "milestone_id", "status_history", "photo_urls", "activity_code", "grn_po_id",
      "assigned_user_ids", "source_form",
    ],
  },
  activity_types_master: {
    changeKey: "created_at",
    full: true,
    columns: [
      "id", "name", "is_active", "created_by", "created_at", "sort_order",
      "details",
    ],
  },
  gps_tracking: {
    changeKey: "timestamp",
    columns: [
      "id", "user_id", "latitude", "longitude", "accuracy", "timestamp", "date",
      "speed", "heading",
    ],
  },
  gps_tracking_stops: {
    changeKey: "timestamp",
    columns: [
      "id", "user_id", "latitude", "longitude", "reason", "duration_minutes",
      "timestamp",
    ],
  },
  procurement_attachments: {
    changeKey: "created_at",
    full: true,
    columns: [
      "id", "po_id", "vendor_id", "scope", "file_name", "file_path", "file_size",
      "content_type", "salesforce_id", "source", "created_by", "created_at",
    ],
  },
  procurement_grn_items: {
    changeKey: "updated_at",
    columns: [
      "id", "grn_id", "procurement_item_id", "product_id", "ordered_qty",
      "received_qty", "created_at", "updated_at",
    ],
  },
  procurement_grns: {
    changeKey: "updated_at",
    columns: [
      "id", "po_id", "grn_number", "receipt_date", "received_by", "status",
      "remarks", "created_by", "created_at", "updated_at", "photos", "vendor_id",
    ],
  },
  procurement_import_runs: {
    changeKey: "started_at",
    full: true,
    columns: [
      "id", "requested_from", "requested_to", "started_at", "finished_at", "total",
      "created", "updated", "failed", "summary", "triggered_by",
    ],
  },
  procurement_invoice_attachments: {
    changeKey: "created_at",
    full: true,
    columns: [
      "id", "invoice_id", "file_name", "file_size", "file_path", "created_by",
      "created_at", "salesforce_id",
    ],
  },
  procurement_invoice_items: {
    changeKey: "created_at",
    full: true,
    columns: [
      "id", "invoice_id", "procurement_item_id", "product_id", "invoiced_rate",
      "invoiced_qty", "created_at",
    ],
  },
  procurement_invoice_payments: {
    changeKey: "created_at",
    full: true,
    columns: [
      "id", "invoice_id", "reference_number", "bank_name", "amount",
      "payment_date", "created_by", "created_at", "notes", "salesforce_id",
    ],
  },
  procurement_invoices: {
    changeKey: "updated_at",
    columns: [
      "id", "po_id", "invoice_number", "invoice_date", "invoice_amount",
      "created_by", "created_at", "updated_at", "vendor_id", "salesforce_id",
    ],
  },
  procurement_items: {
    changeKey: "updated_at",
    columns: [
      "id", "procurement_id", "product_id", "rate", "qty", "amount", "created_at",
      "updated_at", "uom", "vendor_ids", "rate_source", "rate_source_vendor_id",
      "salesforce_id",
    ],
  },
  procurement_orders: {
    changeKey: "updated_at",
    columns: [
      "id", "order_date", "vendor_id", "po_number", "site_id", "entity_id",
      "status", "grn_number", "grn_status", "total_amount", "created_by",
      "created_at", "updated_at", "expected_delivery_date", "payment_terms",
      "estimated_budget", "bill_to", "ship_to", "vendor_ids", "requisition_notes",
      "bill_to_address_id", "ship_to_address_id", "bill_to_gst", "ship_to_gst",
      "source_type", "transfer_from_site_id", "stage_history", "requisition_name",
      "terms_and_conditions", "requisition_number", "salesforce_id",
    ],
  },
  procurement_vendor_feedback: {
    changeKey: "updated_at",
    columns: [
      "id", "grn_id", "vendor_id", "po_id", "delivery_timeliness",
      "material_quality", "quantity_accuracy", "overall_experience", "comments",
      "created_by", "created_at", "updated_at",
    ],
  },
  procurement_vendor_quote_items: {
    changeKey: "updated_at",
    columns: [
      "id", "quote_id", "procurement_item_id", "rate", "discount_pct",
      "rate_after_discount", "delivery_commitment_date", "is_selected",
      "created_at", "updated_at", "quality_notes", "salesforce_id",
    ],
  },
  procurement_vendor_quotes: {
    changeKey: "updated_at",
    columns: [
      "id", "po_id", "vendor_id", "token", "status", "vendor_payment_term",
      "notes", "submitted_at", "created_by", "created_at", "updated_at",
      "procurement_item_ids", "change_request_notes", "attachments",
      "terms_accepted_at", "first_submitted_at", "last_resubmitted_at",
      "reopened_at", "reopened_by", "term_responses", "version", "is_latest",
      "salesforce_id",
    ],
  },
  project_sites: {
    changeKey: "updated_at",
    columns: [
      "id", "site_name", "site_code", "description", "is_active", "deleted_at",
      "created_by", "created_at", "updated_at", "start_date", "end_date", "flag",
      "status", "attachment_urls", "image_url",
    ],
  },
  site_assignments: {
    changeKey: "assigned_at",
    full: true,
    columns: [
      "id", "site_id", "user_id", "assigned_at", "assigned_by",
    ],
  },
  site_files: {
    changeKey: "updated_at",
    columns: [
      "id", "site_id", "kind", "storage_key", "file_name", "file_size",
      "mime_type", "uploaded_by", "created_at", "updated_at",
    ],
  },
  site_milestone_comments: {
    changeKey: "updated_at",
    columns: [
      "id", "milestone_id", "user_id", "content", "created_at", "updated_at",
    ],
  },
  site_milestones: {
    changeKey: "updated_at",
    columns: [
      "id", "site_id", "name", "start_date", "end_date", "status", "priority",
      "created_at", "updated_at", "actual_start_date", "actual_end_date",
      "percent_complete", "notes", "is_active", "at_risk", "parent_id",
    ],
  },
};

function sourceHeaders(extra: Record<string, string> = {}) {
  return {
    "Content-Type": "application/json",
    apikey: SOURCE_SERVICE_KEY,
    Authorization: `Bearer ${SOURCE_SERVICE_KEY}`,
    ...extra,
  };
}

function externalHeaders(extra: Record<string, string> = {}) {
  return {
    "Content-Type": "application/json",
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    ...extra,
  };
}

function pick(row: Record<string, unknown>, cols: string[]) {
  const out: Record<string, unknown> = {};
  for (const c of cols) if (c in row) out[c] = row[c];
  return out;
}

async function writeAudit(entry: {
  traceId?: string;
  sourceTable: string;
  destinationTable: string;
  rowCount: number;
  status: "success" | "failure";
  httpStatus?: number;
  errorMessage?: string;
}) {
  try {
    await fetch(`${SOURCE_URL}/rest/v1/backup_mirror_audit`, {
      method: "POST",
      headers: sourceHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify({
        trace_id: entry.traceId ?? null,
        source_table: entry.sourceTable,
        destination_table: entry.destinationTable,
        row_count: entry.rowCount,
        status: entry.status,
        http_status: entry.httpStatus ?? null,
        error_message: entry.errorMessage ?? null,
      }),
    });
  } catch (err) {
    console.error("audit write failed:", err instanceof Error ? err.message : String(err));
  }
}

async function getWatermark(table: string): Promise<string> {
  const res = await fetch(
    `${SOURCE_URL}/rest/v1/backup_mirror_state?table_name=eq.${table}&select=last_synced_at`,
    { headers: sourceHeaders() },
  );
  if (!res.ok) return EPOCH;
  const rows = await res.json();
  return rows?.[0]?.last_synced_at ?? EPOCH;
}

async function setWatermark(table: string, value: string) {
  await fetch(`${SOURCE_URL}/rest/v1/backup_mirror_state`, {
    method: "POST",
    headers: sourceHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({
      table_name: table,
      last_synced_at: value,
      last_run_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
}

async function fetchPage(table: string, spec: TableSpec, since: string, offset: number) {
  const params = new URLSearchParams();
  params.set("select", spec.columns.join(","));
  params.set("order", `${spec.changeKey}.asc,id.asc`);
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));
  if (since !== EPOCH) params.set(spec.changeKey, `gt.${since}`);

  const res = await fetch(`${SOURCE_URL}/rest/v1/${table}?${params.toString()}`, {
    headers: sourceHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`source read ${table} ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as Record<string, unknown>[];
}

async function pushRows(table: string, rows: Record<string, unknown>[], cols: string[]) {
  const body = rows.map((r) => pick(r, cols));
  const res = await fetch(`${EXTERNAL_URL}/rest/v1/builders_${table}`, {
    method: "POST",
    headers: externalHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`external ${res.status}: ${text.slice(0, 400)}`) as Error & { httpStatus?: number };
    err.httpStatus = res.status;
    throw err;
  }
  await res.text();
}

async function syncTable(table: string, spec: TableSpec, traceId: string, full: boolean) {
  const since = full || spec.full ? EPOCH : await getWatermark(table);
  const destination = `builders_${table}`;
  let offset = 0;
  let total = 0;
  let highWater = since;

  try {
    while (true) {
      const rows = await fetchPage(table, spec, since, offset);
      if (rows.length === 0) break;

      await pushRows(table, rows, spec.columns);
      total += rows.length;

      const last = rows[rows.length - 1]?.[spec.changeKey];
      if (typeof last === "string" && last > highWater) highWater = last;

      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    // Advance the watermark only after every batch succeeded.
    await setWatermark(table, highWater);
    await writeAudit({
      traceId,
      sourceTable: table,
      destinationTable: destination,
      rowCount: total,
      status: "success",
      httpStatus: 200,
    });
    return { table: destination, rows: total, status: "success" as const };
  } catch (err) {
    const e = err as Error & { httpStatus?: number };
    await writeAudit({
      traceId,
      sourceTable: table,
      destinationTable: destination,
      rowCount: total,
      status: "failure",
      httpStatus: e.httpStatus,
      errorMessage: e.message,
    });
    return { table: destination, rows: total, status: "failure" as const, error: e.message };
  }
}

async function externalCount(table: string) {
  const res = await fetch(`${EXTERNAL_URL}/rest/v1/builders_${table}?select=id`, {
    method: "HEAD",
    headers: externalHeaders({ Prefer: "count=exact" }),
  });
  if (!res.ok) return -1;
  const range = res.headers.get("content-range") ?? "0-0/0";
  const total = Number(range.split("/").pop() ?? 0);
  return Number.isFinite(total) ? total : 0;
}

async function localCount(table: string) {
  const res = await fetch(`${SOURCE_URL}/rest/v1/${table}?select=id`, {
    method: "HEAD",
    headers: sourceHeaders({ Prefer: "count=exact" }),
  });
  if (!res.ok) return -1;
  const range = res.headers.get("content-range") ?? "0-0/0";
  const total = Number(range.split("/").pop() ?? 0);
  return Number.isFinite(total) ? total : 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (!SERVICE_KEY) return json({ error: "BACKUP_MIRROR_SERVICE_KEY not configured" }, 500);
  if (!SOURCE_URL || !SOURCE_SERVICE_KEY) return json({ error: "source credentials not configured" }, 500);

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const action = String(payload?.action ?? "sync");
  const traceId = String(payload?.trace_id ?? crypto.randomUUID());

  try {
    if (action === "status") {
      const counts: Record<string, { local: number; external: number }> = {};
      for (const table of Object.keys(TABLES)) {
        counts[table] = { local: await localCount(table), external: await externalCount(table) };
      }
      return json({ ok: true, counts });
    }

    const full = action === "backfill";
    const only = typeof payload?.table === "string" ? [payload.table as string] : Object.keys(TABLES);

    const results = [];
    for (const table of only) {
      const spec = TABLES[table];
      if (!spec) {
        results.push({ table, status: "failure", error: "table not allowlisted" });
        continue;
      }
      results.push(await syncTable(table, spec, traceId, full));
    }

    const failed = results.filter((r) => r.status === "failure");
    console.log(`backup-mirror ${action} trace=${traceId} failures=${failed.length}`);
    return json({ ok: failed.length === 0, trace_id: traceId, results }, failed.length ? 207 : 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("backup-mirror failed:", msg);
    return json({ error: msg }, 502);
  }
});
