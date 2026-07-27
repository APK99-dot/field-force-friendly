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

type TableSpec = { changeKey: string; columns: string[] };

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
  const since = full ? EPOCH : await getWatermark(table);
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
