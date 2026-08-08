import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const days = (a?: string | null, b?: string | null) =>
  a && b ? Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) : null;

/** Mirrors src/lib/vendorScore.ts — negative (risk) score per feedback record. */
function feedbackPenalty(stars: number, areas: string[]) {
  const star = Math.max(0, (5 - stars) * 10);
  const area = Math.min(20, (areas?.length || 0) * 5);
  return Math.min(60, star + area);
}

const SCHEMA_PROJECT = `Return JSON with EXACTLY this shape (no extra keys):
{
  "headline": "one punchy sentence describing where this project stands today",
  "health": "on_track" | "at_risk" | "critical",
  "health_reason": "one sentence justifying the health rating",
  "progress": { "narrative": "2-3 sentences on overall progress vs plan", "highlights": ["short bullet"], "blockers": ["short bullet"] },
  "activity": { "narrative": "2-3 sentences summarising field activity, cadence, team engagement", "recent_themes": ["short bullet"] },
  "budget": { "narrative": "2-3 sentences on committed spend vs budget, invoicing and payment posture", "watchouts": ["short bullet"] },
  "risks": [ { "title": "short risk title", "severity": "high" | "medium" | "low", "detail": "one sentence", "mitigation": "one sentence" } ],
  "vendor_exposure": "1-2 sentences on the vendors serving this project and any dependency/performance concern, or null",
  "schedule_outlook": "1-2 sentences on likely completion timing vs planned end date, or null",
  "next_actions": [ { "action": "imperative action", "owner_hint": "role that should act", "urgency": "now" | "this_week" | "this_month" } ],
  "questions_to_ask": ["a sharp question a reviewer should ask in the next review"],
  "audio_script": "a natural spoken briefing of 130-180 words covering progress, activity, budget and risk. Plain sentences, no markdown, no bullet characters, no emojis."
}`;

const SCHEMA_VENDOR = `Return JSON with EXACTLY this shape (no extra keys):
{
  "headline": "one punchy sentence describing this vendor relationship today",
  "health": "strong" | "watch" | "at_risk",
  "health_reason": "one sentence justifying the rating",
  "relationship": { "narrative": "3-4 sentences on the history and depth of the relationship: since when, volume, consistency, sites served", "milestones": ["short bullet on a notable moment in the relationship"] },
  "products": { "narrative": "2-3 sentences on what we buy from them and price behaviour", "top_items": [ { "product": "name", "qty_note": "short", "rate_note": "short price/trend note" } ] },
  "commercials": { "narrative": "2-3 sentences on spend, invoicing, payment terms and outstanding balance", "watchouts": ["short bullet"] },
  "delivery": { "narrative": "2-3 sentences on delivery reliability and lead times", "watchouts": ["short bullet"] },
  "feedback": { "narrative": "2-3 sentences on rated experience and recurring improvement areas", "recurring_issues": ["short bullet"] },
  "risks": [ { "title": "short risk title", "severity": "high" | "medium" | "low", "detail": "one sentence", "mitigation": "one sentence" } ],
  "concentration": "1-2 sentences on dependency/concentration risk (share of spend, single-source items), or null",
  "negotiation_levers": ["a concrete lever to use in the next negotiation"],
  "next_actions": [ { "action": "imperative action", "owner_hint": "role that should act", "urgency": "now" | "this_week" | "this_month" } ],
  "audio_script": "a natural spoken briefing of 130-180 words covering relationship, products, commercials, feedback and risk. Plain sentences, no markdown, no bullet characters, no emojis."
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { type, id } = await req.json().catch(() => ({}));
    if (type !== "project" && type !== "vendor") return json({ error: "type must be 'project' or 'vendor'" }, 400);
    if (!id || typeof id !== "string") return json({ error: "id is required" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI is not configured" }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: userData } = await supabase.auth.getUser(token);
    if (!userData?.user) return json({ error: "Not authenticated" }, 401);

    const today = new Date().toISOString().slice(0, 10);
    let context: Record<string, unknown>;
    let facts: Record<string, unknown>;
    let schemaHint: string;
    let system: string;

    if (type === "project") {
      const { data: site, error: siteErr } = await supabase
        .from("project_sites")
        .select("id, site_name, site_code, description, status, flag, start_date, end_date, base_address, is_active")
        .eq("id", id)
        .maybeSingle();
      if (siteErr || !site) return json({ error: "Project / site not found" }, 404);

      const [{ data: milestones }, { data: activities }, { data: orders }, { data: assignments }] = await Promise.all([
        supabase.from("site_milestones").select("id, name, start_date, end_date, actual_start_date, actual_end_date, percent_complete, status, at_risk, is_active, parent_id, notes").eq("site_id", id),
        supabase.from("activity_events").select("id, activity_code, activity_name, activity_type, activity_date, status, remarks, description, user_id, check_in_at, check_out_at, check_in_within_site, milestone_id").eq("site_id", id).order("activity_date", { ascending: false }).limit(150),
        supabase.from("procurement_orders").select("id, requisition_number, po_number, status, order_date, total_amount, estimated_budget, vendor_id, expected_delivery_date, source_type").eq("site_id", id),
        supabase.from("site_assignments").select("user_id").eq("site_id", id),
      ]);

      const poIds = (orders || []).map((o: any) => o.id);
      const [{ data: invoices }, { data: payments }, { data: vendors }] = await Promise.all([
        poIds.length ? supabase.from("procurement_invoices").select("id, po_id, invoice_amount, invoice_date").in("po_id", poIds) : Promise.resolve({ data: [] as any[] }),
        poIds.length ? supabase.from("procurement_invoice_payments").select("invoice_id, amount, payment_date").limit(2000) : Promise.resolve({ data: [] as any[] }),
        supabase.from("vendors").select("id, name"),
      ]);

      const vendorName = new Map((vendors || []).map((v: any) => [v.id, v.name]));
      const invoiceIds = new Set((invoices || []).map((i: any) => i.id));
      const paidTotal = (payments || []).filter((p: any) => invoiceIds.has(p.invoice_id)).reduce((a: number, p: any) => a + num(p.amount), 0);

      const live = (milestones || []).filter((m: any) => m.is_active !== false);
      const avgProgress = live.length ? round(live.reduce((a: number, m: any) => a + num(m.percent_complete), 0) / live.length, 1) : 0;
      const overdue = live.filter((m: any) => m.end_date && m.end_date < today && num(m.percent_complete) < 100);

      const typeCounts: Record<string, number> = {};
      (activities || []).forEach((a: any) => { typeCounts[a.activity_type || "other"] = (typeCounts[a.activity_type || "other"] || 0) + 1; });

      const committed = (orders || []).reduce((a: number, o: any) => a + num(o.total_amount), 0);
      const budget = (orders || []).reduce((a: number, o: any) => a + num(o.estimated_budget), 0);
      const invoiced = (invoices || []).reduce((a: number, i: any) => a + num(i.invoice_amount), 0);

      const elapsed = days(site.start_date, today);
      const total = days(site.start_date, site.end_date);

      facts = {
        milestones_total: live.length,
        milestones_completed: live.filter((m: any) => m.status === "completed").length,
        milestones_overdue: overdue.length,
        milestones_at_risk: live.filter((m: any) => m.at_risk).length,
        avg_progress_pct: avgProgress,
        time_elapsed_pct: total && total > 0 && elapsed != null ? Math.min(100, round((elapsed / total) * 100, 1)) : null,
        activities_total: (activities || []).length,
        activities_last_30d: (activities || []).filter((a: any) => a.activity_date >= new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)).length,
        team_size: (assignments || []).length,
        purchase_orders: (orders || []).length,
        budget_estimated: round(budget),
        committed_spend: round(committed),
        invoiced: round(invoiced),
        paid: round(paidTotal),
        outstanding: round(invoiced - paidTotal),
        planned_end: site.end_date,
      };

      context = {
        today,
        project: site,
        stats: facts,
        milestones: live.map((m: any) => ({
          name: m.name, status: m.status, percent: num(m.percent_complete), plan: [m.start_date, m.end_date],
          actual: [m.actual_start_date, m.actual_end_date], at_risk: m.at_risk, notes: m.notes,
        })),
        activity_type_mix: typeCounts,
        recent_activities: (activities || []).slice(0, 40).map((a: any) => ({
          date: a.activity_date, type: a.activity_type, name: a.activity_name, status: a.status,
          remarks: (a.remarks || a.description || "").slice(0, 240), on_site: a.check_in_within_site,
        })),
        procurement: (orders || []).map((o: any) => ({
          ref: o.requisition_number || o.po_number, status: o.status, date: o.order_date,
          amount: num(o.total_amount), budget: num(o.estimated_budget),
          vendor: o.vendor_id ? vendorName.get(o.vendor_id) : null, needed_by: o.expected_delivery_date,
          kind: o.source_type,
        })),
      };

      system = `You are a senior construction project controls analyst for an Indian infrastructure company.
You brief executives on project health using ONLY the supplied data. All amounts are Indian Rupees (INR).
Never invent facts, names, dates or numbers. If evidence is thin, say so plainly.
Be specific: cite milestone names, dates, percentages and amounts from the data. Respond in JSON only.`;
      schemaHint = SCHEMA_PROJECT;
    } else {
      const { data: vendor, error: vErr } = await supabase
        .from("vendors")
        .select("id, name, category, services, status, phone, email, address, gst_number, pan_number, annual_revenue, employee_count, notes, created_at")
        .eq("id", id)
        .maybeSingle();
      if (vErr || !vendor) return json({ error: "Vendor not found" }, 404);

      const { data: orders } = await supabase
        .from("procurement_orders")
        .select("id, requisition_number, po_number, status, order_date, total_amount, vendor_id, vendor_ids, site_id, payment_terms, expected_delivery_date, source_type")
        .or(`vendor_id.eq.${id},vendor_ids.cs.{${id}}`);

      const poIds = (orders || []).map((o: any) => o.id);
      const [{ data: items }, { data: grns }, { data: invoices }, { data: feedback }, { data: quotes }, { data: sites }, { data: products }] = await Promise.all([
        poIds.length ? supabase.from("procurement_items").select("procurement_id, product_id, qty, uom, rate, amount, rate_source_vendor_id").in("procurement_id", poIds) : Promise.resolve({ data: [] as any[] }),
        supabase.from("procurement_grns").select("id, po_id, grn_number, receipt_date, status").eq("vendor_id", id),
        supabase.from("procurement_invoices").select("id, po_id, invoice_number, invoice_amount, invoice_date").eq("vendor_id", id),
        supabase.from("procurement_vendor_feedback").select("overall_experience, material_quality, delivery_timeliness, quantity_accuracy, improvement_areas, comments, created_at, po_id, grn_id").eq("vendor_id", id),
        supabase.from("procurement_vendor_quotes").select("id, po_id, status, total_amount, created_at, is_latest").eq("vendor_id", id),
        supabase.from("project_sites").select("id, site_name"),
        supabase.from("master_products").select("id, product_name, default_uom, budgeted_rate"),
      ]);

      const invIds = (invoices || []).map((i: any) => i.id);
      const { data: payments } = invIds.length
        ? await supabase.from("procurement_invoice_payments").select("invoice_id, amount, payment_date").in("invoice_id", invIds)
        : { data: [] as any[] };

      const siteName = new Map((sites || []).map((s: any) => [s.id, s.site_name]));
      const productById = new Map((products || []).map((p: any) => [p.id, p]));
      const orderById = new Map((orders || []).map((o: any) => [o.id, o]));

      // Product rollup
      const byProduct: Record<string, any> = {};
      (items || []).forEach((it: any) => {
        if (!it.product_id) return;
        const p = productById.get(it.product_id);
        const o = orderById.get(it.procurement_id);
        const k = it.product_id;
        byProduct[k] ||= { product: p?.product_name || "Unknown", uom: it.uom || p?.default_uom || null, budgeted_rate: p?.budgeted_rate ?? null, times: 0, qty: 0, value: 0, rates: [] as number[], last_date: null as string | null };
        const row = byProduct[k];
        row.times += 1;
        row.qty += num(it.qty);
        row.value += num(it.amount) || num(it.qty) * num(it.rate);
        if (num(it.rate)) row.rates.push(num(it.rate));
        if (o?.order_date && (!row.last_date || o.order_date > row.last_date)) row.last_date = o.order_date;
      });
      const productRollup = Object.values(byProduct)
        .map((r: any) => ({
          product: r.product, uom: r.uom, times_supplied: r.times, total_qty: round(r.qty, 2), total_value: round(r.value),
          first_rate: r.rates.length ? round(r.rates[0]) : null,
          last_rate: r.rates.length ? round(r.rates[r.rates.length - 1]) : null,
          avg_rate: r.rates.length ? round(r.rates.reduce((a: number, b: number) => a + b, 0) / r.rates.length) : null,
          budgeted_rate: r.budgeted_rate == null ? null : round(num(r.budgeted_rate)),
          last_supplied: r.last_date,
        }))
        .sort((a, b) => b.total_value - a.total_value);

      // Delivery reliability
      let onTime = 0, late = 0;
      const leadTimes: number[] = [];
      (grns || []).forEach((g: any) => {
        const o = orderById.get(g.po_id);
        if (!o) return;
        const lt = days(o.order_date, g.receipt_date);
        if (lt != null && lt >= 0) leadTimes.push(lt);
        if (o.expected_delivery_date && g.receipt_date) {
          if (g.receipt_date <= o.expected_delivery_date) onTime += 1; else late += 1;
        }
      });

      const fbList = (feedback || []).map((f: any) => ({
        stars: num(f.overall_experience),
        areas: Array.isArray(f.improvement_areas) ? f.improvement_areas : [],
        comments: f.comments,
        on: f.created_at,
      }));
      const penalties = fbList.map((f) => feedbackPenalty(f.stars, f.areas));
      const negativeScore = fbList.length ? round((penalties.reduce((a, b) => a + b, 0) / (fbList.length * 60)) * 100, 1) : null;
      const areaCounts: Record<string, number> = {};
      fbList.forEach((f) => f.areas.forEach((a: string) => { areaCounts[a] = (areaCounts[a] || 0) + 1; }));

      const invoiced = (invoices || []).reduce((a: number, i: any) => a + num(i.invoice_amount), 0);
      const paid = (payments || []).reduce((a: number, p: any) => a + num(p.amount), 0);
      const spend = (orders || []).reduce((a: number, o: any) => a + num(o.total_amount), 0);
      const orderDates = (orders || []).map((o: any) => o.order_date).filter(Boolean).sort();

      facts = {
        vendor_since: orderDates[0] || vendor.created_at?.slice(0, 10) || null,
        last_order_on: orderDates[orderDates.length - 1] || null,
        orders_total: (orders || []).length,
        po_total: (orders || []).filter((o: any) => o.po_number).length,
        quotes_submitted: (quotes || []).length,
        grns_total: (grns || []).length,
        sites_served: [...new Set((orders || []).map((o: any) => o.site_id).filter(Boolean))].length,
        distinct_products: productRollup.length,
        total_spend: round(spend),
        invoiced: round(invoiced),
        paid: round(paid),
        outstanding: round(invoiced - paid),
        on_time_deliveries: onTime,
        late_deliveries: late,
        on_time_pct: onTime + late ? Math.round((onTime / (onTime + late)) * 100) : null,
        avg_lead_time_days: leadTimes.length ? Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length) : null,
        feedback_count: fbList.length,
        avg_rating: fbList.length ? round(fbList.reduce((a, f) => a + f.stars, 0) / fbList.length, 2) : null,
        negative_score: negativeScore,
        improvement_area_counts: areaCounts,
      };

      context = {
        today,
        vendor: {
          name: vendor.name, category: vendor.category, services: vendor.services, status: vendor.status,
          location: vendor.address, gst: vendor.gst_number, pan: vendor.pan_number,
          annual_revenue: vendor.annual_revenue, employees: vendor.employee_count, notes: vendor.notes,
          onboarded: vendor.created_at,
        },
        stats: facts,
        products: productRollup.slice(0, 25),
        orders: (orders || []).slice(0, 60).map((o: any) => ({
          ref: o.po_number || o.requisition_number, status: o.status, date: o.order_date,
          amount: num(o.total_amount), site: o.site_id ? siteName.get(o.site_id) : null,
          terms: o.payment_terms, needed_by: o.expected_delivery_date,
        })),
        receipts: (grns || []).slice(0, 40).map((g: any) => ({ grn: g.grn_number, on: g.receipt_date, status: g.status })),
        invoices: (invoices || []).slice(0, 40).map((i: any) => ({ no: i.invoice_number, amount: num(i.invoice_amount), on: i.invoice_date })),
        feedback: fbList.slice(0, 40),
      };

      system = `You are a senior vendor-management and procurement analyst for an Indian construction company.
You brief category managers on vendor relationships using ONLY the supplied data. All amounts are Indian Rupees (INR).
Never invent facts, names, dates or numbers. If evidence is thin, say so plainly.
The "negative_score" is a 0-100 risk score where LOWER IS BETTER. Be specific and cite numbers. Respond in JSON only.`;
      schemaHint = SCHEMA_VENDOR;
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: `${schemaHint}\n\nRecord data (JSON):\n${JSON.stringify(context)}` },
        ],
      }),
    });

    if (aiRes.status === 429) return json({ error: "AI rate limit reached. Please try again shortly." }, 429);
    if (aiRes.status === 402) return json({ error: "AI credits exhausted. Please top up workspace credits." }, 402);
    if (!aiRes.ok) {
      const body = await aiRes.text();
      console.error("AI gateway error", aiRes.status, body);
      return json({ error: "AI request failed", details: body }, 502);
    }

    const aiJson = await aiRes.json();
    let summary: any = null;
    try {
      summary = JSON.parse(aiJson?.choices?.[0]?.message?.content ?? "{}");
    } catch (e) {
      console.error("Failed to parse AI content", e);
      return json({ error: "AI returned an unreadable response. Please retry." }, 502);
    }

    return json({
      type,
      generated_at: new Date().toISOString(),
      title: type === "project" ? (context as any).project?.site_name : (context as any).vendor?.name,
      facts,
      summary,
    });
  } catch (err) {
    console.error("ai-record-summary failed:", err);
    return json({ error: (err as Error).message || "Unexpected error" }, 500);
  }
});
