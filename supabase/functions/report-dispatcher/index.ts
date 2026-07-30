// report-dispatcher — the only entry point for running report subscriptions.
//
// Two paths:
//   * CRON    — POST with an `x-cron-secret` header. Scans active subscriptions,
//               works out which ones are due right now in their own timezone, and
//               invokes generate-report once per due subscription.
//   * MANUAL  — POST { mode: 'manual', subscription_id } with an admin's JWT in
//               Authorization. Fires that one subscription immediately, ignoring
//               idempotency and without touching last_scheduled_*.
//
// AUTH — deliberate deviations from the source:
//   * The source accepted the cron path whenever `x-cron-secret` matched either
//     CRON_SECRET or push_config.trigger_secret, and silently degraded when
//     neither existed. Here the cron path REFUSES to run unless at least one
//     secret is configured — an unauthenticated scheduled run is never possible.
//     CRON_SECRET (an edge-function secret) is the primary; the nullable
//     report_dispatch_config.trigger_secret row created in migration
//     20260730160000 is the secondary, for operators who would rather keep the
//     secret in the database next to the scheduler that uses it.
//   * The source authorised manual runs with is_admin_or_manager(), which does
//     not exist in this database. Admin is resolved the way every other edge
//     function in this repo resolves it (admin-create-user): read the caller's
//     user from their JWT, then check public.user_roles for role = 'admin' with
//     the service client.
//
// No third-party imports beyond the Supabase client this repo already uses.
// computePeriod / computeOccurrence are inlined rather than shared, because this
// repo has no supabase/functions/_shared directory and this is their only caller.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  SERVICE_ROLE;

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
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const authHeader = req.headers.get("Authorization");
    const isManual = body?.mode === "manual" && !!body?.subscription_id;

    // ---- Manual run ---------------------------------------------------------
    if (isManual) {
      if (!authHeader?.startsWith("Bearer ")) {
        return json({ error: "Unauthorized" }, 401);
      }

      const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user: caller },
        error: callerErr,
      } = await callerClient.auth.getUser();
      if (callerErr || !caller) {
        return json({ error: "Unauthorized" }, 401);
      }

      const { data: roleRow, error: roleErr } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", caller.id)
        .eq("role", "admin")
        .maybeSingle();
      if (roleErr) {
        console.error("[report-dispatcher] role lookup failed:", roleErr);
        return json({ error: "Could not verify your role" }, 500);
      }
      if (!roleRow) {
        return json({ error: "Forbidden: admin role required" }, 403);
      }

      const { data: sub, error: subErr } = await admin
        .from("report_subscriptions")
        .select("id, cadence, period_basis")
        .eq("id", body.subscription_id)
        .maybeSingle();
      if (subErr) {
        console.error("[report-dispatcher] subscription lookup failed:", subErr);
        return json({ error: subErr.message }, 500);
      }
      if (!sub) return json({ error: "Subscription not found" }, 404);

      const basis = sub.period_basis === "previous" ? "previous" : "current";
      const period = computePeriod(sub.cadence, new Date(), basis);
      // Manual runs never check idempotency and never update last_scheduled_*.
      const result = await invokeGenerate(sub.id, period, "manual", null);
      if (result.status >= 400) {
        return json(
          { error: (result as any).error ?? "generate-report failed", ...result },
          result.status,
        );
      }
      return json({ ok: true, ...result });
    }

    // ---- Cron run -----------------------------------------------------------
    const providedSecret = req.headers.get("x-cron-secret");
    if (!providedSecret) {
      return json({ error: "Unauthorized" }, 401);
    }

    const envSecret = Deno.env.get("CRON_SECRET");
    let dbSecret: string | null = null;
    const { data: cfg, error: cfgErr } = await admin
      .from("report_dispatch_config")
      .select("trigger_secret")
      .eq("id", true)
      .maybeSingle();
    if (cfgErr) {
      console.error("[report-dispatcher] dispatch config lookup failed:", cfgErr);
    } else {
      dbSecret = cfg?.trigger_secret ?? null;
    }

    // Refuse rather than run unauthenticated when nothing is configured.
    if (!envSecret && !dbSecret) {
      console.error(
        "[report-dispatcher] CRON_SECRET is not set and report_dispatch_config.trigger_secret is NULL — refusing to run.",
      );
      return json(
        {
          error:
            "Scheduled dispatch is not configured. Set the CRON_SECRET edge-function secret (or report_dispatch_config.trigger_secret) before scheduling this function.",
        },
        503,
      );
    }

    const authorised =
      (!!envSecret && providedSecret === envSecret) ||
      (!!dbSecret && providedSecret === dbSecret);
    if (!authorised) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { data: subs, error: subsErr } = await admin
      .from("report_subscriptions")
      .select("id, cadence, fire_day, fire_time, timezone, period_basis, last_scheduled_period_key")
      .eq("status", "active");
    if (subsErr) {
      console.error("[report-dispatcher] subscription scan failed:", subsErr);
      return json({ error: subsErr.message }, 500);
    }

    const results: Array<Record<string, unknown>> = [];
    for (const s of subs ?? []) {
      const tz = s.timezone ?? "Asia/Kolkata";
      const occ = computeOccurrence(s.cadence, s.fire_day, String(s.fire_time ?? "08:00"), tz);
      // Only today's scheduled occurrence is eligible. Catch-up fires it on any
      // tick at or after the fire time, but never revives a prior day.
      if (!occ.matchesToday || !occ.due) continue;
      // Occurrence key = local date + fire_time. Changing fire_time yields a new
      // key, so a same-day schedule change can fire again.
      if (s.last_scheduled_period_key === occ.key) {
        results.push({
          subscription_id: s.id,
          occurrence: occ.key,
          skipped: "already_fired_this_occurrence",
        });
        continue;
      }
      const basis = s.period_basis === "previous" ? "previous" : "current";
      const period = computePeriod(s.cadence, new Date(), basis);
      try {
        const r = await invokeGenerate(s.id, period, "scheduled", occ.key);
        results.push({ subscription_id: s.id, occurrence: occ.key, period: period.key, ...r });
        if (s.cadence === "today") {
          const { error: pauseErr } = await admin
            .from("report_subscriptions")
            .update({ status: "paused" })
            .eq("id", s.id);
          if (pauseErr) console.error("[report-dispatcher] pause failed:", s.id, pauseErr);
        }
      } catch (e) {
        console.error("[report-dispatcher] generate failed:", s.id, e);
        results.push({ subscription_id: s.id, occurrence: occ.key, error: String(e) });
      }
    }

    return json({ ok: true, processed: results.length, results });
  } catch (e) {
    console.error("[report-dispatcher] Unexpected error:", e);
    return json({ error: String(e) }, 500);
  }
});

async function invokeGenerate(
  subscriptionId: string,
  period: Period,
  mode: "scheduled" | "manual",
  occurrenceKey: string | null,
) {
  const url = `${SUPABASE_URL}/functions/v1/generate-report`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
    },
    body: JSON.stringify({
      subscription_id: subscriptionId,
      period,
      mode,
      occurrence_key: occurrenceKey,
    }),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
}

// ---------------------------------------------------------------------------
// Reporting period + occurrence maths (ported verbatim from the source's
// supabase/functions/_shared/reportPeriod.ts, minus the deprecated isDue()).
// ---------------------------------------------------------------------------

interface Period {
  key: string;
  label: string;
  date_from: string;
  date_to: string;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isoWeek(d: Date): { year: number; week: number } {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  const week = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return { year: target.getUTCFullYear(), week };
}

/**
 * Reporting period for a cadence and basis.
 *   basis='current'  — current period-to-date (today / this week / this month)
 *   basis='previous' — last COMPLETED period (yesterday / last ISO week /
 *                      previous calendar month)
 */
function computePeriod(
  cadence: string,
  now: Date = new Date(),
  basis: "current" | "previous" = "current",
): Period {
  const today = new Date(now);
  const todayStr = fmt(today);

  if (cadence === "daily" || cadence === "weekday" || cadence === "today") {
    if (basis === "previous") {
      const y = new Date(today.valueOf() - 86400000);
      const s = fmt(y);
      return { key: s, label: s, date_from: s, date_to: s };
    }
    return { key: todayStr, label: todayStr, date_from: todayStr, date_to: todayStr };
  }

  if (cadence === "weekly") {
    const w = new Date(now);
    const dayNr = (w.getUTCDay() + 6) % 7;
    w.setUTCDate(w.getUTCDate() - dayNr); // Monday of the current week
    if (basis === "previous") {
      const monPrev = new Date(w.valueOf() - 7 * 86400000);
      const sunPrev = new Date(monPrev.valueOf() + 6 * 86400000);
      const iw = isoWeek(monPrev);
      return {
        key: `${iw.year}-W${String(iw.week).padStart(2, "0")}`,
        label: `Week ${iw.week}, ${iw.year}`,
        date_from: fmt(monPrev),
        date_to: fmt(sunPrev),
      };
    }
    const iw = isoWeek(w);
    return {
      key: `${iw.year}-W${String(iw.week).padStart(2, "0")}`,
      label: `Week ${iw.week}, ${iw.year} (to date)`,
      date_from: fmt(w),
      date_to: todayStr,
    };
  }

  // monthly
  if (basis === "current") {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const key = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    return {
      key,
      label: now.toLocaleString("en-US", { month: "long", year: "numeric" }) + " (to date)",
      date_from: fmt(first),
      date_to: todayStr,
    };
  }
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const prevLast = new Date(first.valueOf() - 86400000);
  const prevFirst = new Date(Date.UTC(prevLast.getUTCFullYear(), prevLast.getUTCMonth(), 1));
  const key = `${prevLast.getUTCFullYear()}-${String(prevLast.getUTCMonth() + 1).padStart(2, "0")}`;
  return {
    key,
    label: prevLast.toLocaleString("en-US", { month: "long", year: "numeric" }),
    date_from: fmt(prevFirst),
    date_to: fmt(prevLast),
  };
}

interface Occurrence {
  key: string; // e.g. "2026-07-30T08:00"
  dueAt: string;
  due: boolean;
  matchesToday: boolean;
}

/**
 * The current scheduled occurrence for a subscription, and whether it is due.
 *
 * The occurrence key is the local calendar date plus fire_time — derived from
 * the SCHEDULE, not from the reporting period, so that changing fire_time yields
 * a new key (allowing another fire the same day) and period_basis never affects
 * idempotency.
 *
 * `due` is true when today matches the cadence's day rule AND the current local
 * time is at or past today's fire time. Previous days are never revived.
 */
function computeOccurrence(
  cadence: string,
  fireDay: string | null,
  fireTime: string,
  tz: string,
  now: Date = new Date(),
): Occurrence {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const y = get("year");
  const mo = get("month");
  const d = get("day");
  const hh = parseInt(get("hour"), 10);
  const mm = parseInt(get("minute"), 10);
  const weekday = get("weekday");
  const day = parseInt(d, 10);

  const [fh, fm] = fireTime.split(":").map((n) => parseInt(n, 10));
  const nowMin = hh * 60 + mm;
  const fireMin = fh * 60 + fm;

  let matchesToday = false;
  if (cadence === "daily" || cadence === "today") matchesToday = true;
  else if (cadence === "weekday") matchesToday = !["Sat", "Sun"].includes(weekday);
  else if (cadence === "weekly") {
    matchesToday = weekday
      .toLowerCase()
      .startsWith((fireDay ?? "mon").slice(0, 3).toLowerCase());
  } else if (cadence === "monthly") matchesToday = day === parseInt(fireDay ?? "1", 10);

  const hhmm = `${String(fh).padStart(2, "0")}:${String(fm).padStart(2, "0")}`;
  const key = `${y}-${mo}-${d}T${hhmm}`;

  return { key, dueAt: key, matchesToday, due: matchesToday && nowMin >= fireMin };
}
