import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/salesforce";

interface SFRow { Id: string; Name: string | null; Requisition_Raised_Date__c: string | null; }

interface RecordResult {
  salesforce_id: string;
  name?: string | null;
  status: "created" | "updated" | "failed";
  error?: string;
  order_id?: string;
  po_status?: string;
  duration_ms?: number;
}

function clampBatchSize(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(3, Math.floor(parsed)));
}

function parseCursor(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function validateDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must be YYYY-MM-DD`);
}

function validateSalesforceId(id: string) {
  if (!/^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(id)) throw new Error(`Invalid Salesforce Id: ${id}`);
}

async function sfQuery<T = unknown>(soql: string, apiKey: string, gatewayKey: string): Promise<T[]> {
  const results: T[] = [];
  let next: string | null = `/query?q=${encodeURIComponent(soql)}`;
  while (next) {
    const resp = await fetch(`${GATEWAY_URL}${next}`, {
      headers: { Authorization: `Bearer ${gatewayKey}`, "X-Connection-Api-Key": apiKey },
    });
    const json = await resp.json();
    if (!resp.ok) throw new Error(`Salesforce query failed [${resp.status}]: ${JSON.stringify(json).slice(0, 400)}`);
    results.push(...(json.records ?? []));
    next = json.nextRecordsUrl ? json.nextRecordsUrl.replace("/services/data/v62.0", "") : null;
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SALESFORCE_API_KEY = Deno.env.get("SALESFORCE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!LOVABLE_API_KEY || !SALESFORCE_API_KEY || !SUPABASE_URL || !SERVICE_ROLE) {
      return json({ error: "Server or Salesforce connector not configured." }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: userData } = await admin.auth.getUser(token);
    if (!userData?.user) return json({ error: "Not authenticated" }, 401);
    const uid = userData.user.id;
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: uid, _role: "admin" });
    if (!isAdmin) return json({ error: "Admin access required" }, 403);

    const body = await req.json().catch(() => ({}));
    const from = String(body?.from || "2026-06-01");
    const to = String(body?.to || "2026-06-30");
    validateDate(from, "from");
    validateDate(to, "to");
    const idsFilter: string[] | null = Array.isArray(body?.ids) ? body.ids.map(String) : null;
    idsFilter?.forEach(validateSalesforceId);
    const cursor = parseCursor(body?.cursor);
    const batchSize = clampBatchSize(body?.batch_size);
    const runId = typeof body?.run_id === "string" && body.run_id.trim() ? body.run_id.trim() : null;

    // Build list of SF ids to import
    let sfRows: SFRow[];
    if (idsFilter && idsFilter.length) {
      const list = idsFilter.map((id) => `'${id}'`).join(",");
      sfRows = await sfQuery<SFRow>(
        `SELECT Id, Name, Requisition_Raised_Date__c FROM Requistion__c WHERE Id IN (${list}) ORDER BY Requisition_Raised_Date__c ASC`,
        SALESFORCE_API_KEY, LOVABLE_API_KEY,
      );
    } else {
      sfRows = await sfQuery<SFRow>(
        `SELECT Id, Name, Requisition_Raised_Date__c FROM Requistion__c WHERE Requisition_Raised_Date__c >= ${from} AND Requisition_Raised_Date__c <= ${to} ORDER BY Requisition_Raised_Date__c ASC`,
        SALESFORCE_API_KEY, LOVABLE_API_KEY,
      );
    }

    let run: { id: string; summary?: unknown; created?: number | null; updated?: number | null; failed?: number | null } | null = null;
    if (runId) {
      const { data: existingRun, error: runErr } = await admin.from("procurement_import_runs")
        .select("id, summary, created, updated, failed")
        .eq("id", runId)
        .maybeSingle();
      if (runErr) throw new Error(`load run: ${runErr.message}`);
      if (!existingRun?.id) return json({ error: "Import run not found" }, 404);
      run = existingRun as typeof run;
    } else {
      const { data: newRun, error: runErr } = await admin.from("procurement_import_runs").insert({
        requested_from: from, requested_to: to, total: sfRows.length, triggered_by: uid, summary: [],
      }).select("id, summary, created, updated, failed").single();
      if (runErr) throw new Error(`start run: ${runErr.message}`);
      run = newRun as typeof run;
    }

    if (!run?.id) return json({ error: "Could not start import run" }, 500);

    const singleUrl = `${SUPABASE_URL}/functions/v1/import-salesforce-procurement`;
    const perRecord: RecordResult[] = [];
    let created = 0, updated = 0, failed = 0;
    const batchRows = sfRows.slice(cursor, cursor + batchSize);

    for (const row of batchRows) {
      const startedAt = Date.now();
      try {
        // Check existing before to determine created vs updated
        const { data: pre } = await admin.from("procurement_orders").select("id").eq("salesforce_id", row.Id).maybeSingle();
        const wasExisting = !!pre?.id;

        const resp = await fetch(singleUrl, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
            apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          },
          body: JSON.stringify({ salesforce_id: row.Id }),
        });
        const j = await resp.json().catch(() => ({}));
        if (!resp.ok || (j as any)?.error) {
          failed++;
          perRecord.push({ salesforce_id: row.Id, name: row.Name, status: "failed", error: (j as any)?.error || `HTTP ${resp.status}` });
        } else {
          if (wasExisting) updated++; else created++;
          perRecord.push({
            salesforce_id: row.Id, name: row.Name,
            status: wasExisting ? "updated" : "created",
            order_id: (j as any)?.order_id,
            po_status: (j as any)?.status,
            duration_ms: Date.now() - startedAt,
          });
        }
      } catch (e) {
        failed++;
        perRecord.push({ salesforce_id: row.Id, name: row.Name, status: "failed", error: (e as Error).message });
      }
    }

    const nextCursor = Math.min(sfRows.length, cursor + batchRows.length);
    const done = nextCursor >= sfRows.length;
    const existingSummary = Array.isArray(run?.summary) ? run.summary as RecordResult[] : [];
    const mergedSummary = [...existingSummary, ...perRecord];
    const cumulativeCreated = Number(run?.created || 0) + created;
    const cumulativeUpdated = Number(run?.updated || 0) + updated;
    const cumulativeFailed = Number(run?.failed || 0) + failed;

    await admin.from("procurement_import_runs").update({
      finished_at: done ? new Date().toISOString() : null,
      created: cumulativeCreated,
      updated: cumulativeUpdated,
      failed: cumulativeFailed,
      total: sfRows.length,
      summary: mergedSummary,
    }).eq("id", run.id);

    return json({
      success: true, run_id: run.id,
      total: sfRows.length,
      cursor,
      next_cursor: nextCursor,
      batch_size: batchSize,
      done,
      created, updated, failed,
      cumulative: { created: cumulativeCreated, updated: cumulativeUpdated, failed: cumulativeFailed },
      from, to, records: perRecord,
    }, 200);
  } catch (e) {
    console.error("bulk-import-salesforce-procurement failed:", e);
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
