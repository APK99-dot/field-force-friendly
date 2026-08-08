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
const median = (arr: number[]) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Negative score for a single feedback record — mirrors src/lib/vendorScore.ts. */
function feedbackPenalty(stars: number, areas: string[]) {
  const star = Math.max(0, (5 - stars) * 10);
  const area = Math.min(20, (areas?.length || 0) * 5);
  return Math.min(60, star + area);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { po_id } = await req.json().catch(() => ({}));
    if (!po_id || typeof po_id !== "string") {
      return json({ error: "po_id is required" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI is not configured" }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Caller must be an authenticated user of this app.
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabase.auth.getUser(token);
    if (!userData?.user) return json({ error: "Not authenticated" }, 401);

    /* ---------------- Current requisition ---------------- */
    const { data: order, error: orderErr } = await supabase
      .from("procurement_orders")
      .select("id, po_number, requisition_number, requisition_name, status, order_date, site_id, payment_terms, expected_delivery_date, estimated_budget, source_type")
      .eq("id", po_id)
      .single();
    if (orderErr || !order) return json({ error: "Requisition not found" }, 404);

    const { data: curItems } = await supabase
      .from("procurement_items")
      .select("id, product_id, qty, uom, rate, gst_percent")
      .eq("procurement_id", po_id);

    const items = (curItems || []).filter((i: any) => i.product_id);
    if (!items.length) {
      return json({ error: "Add at least one product line item before running the AI advisor." }, 400);
    }

    const productIds = [...new Set(items.map((i: any) => i.product_id as string))];

    /* ---------------- Reference data ---------------- */
    const [{ data: products }, { data: pastItems }] = await Promise.all([
      supabase
        .from("master_products")
        .select("id, product_name, default_uom, budgeted_rate, lead_time_days, category_id")
        .in("id", productIds),
      supabase
        .from("procurement_items")
        .select("id, procurement_id, product_id, qty, uom, rate, gst_percent, vendor_ids, rate_source, rate_source_vendor_id")
        .in("product_id", productIds)
        .neq("procurement_id", po_id),
    ]);

    const pastPoIds = [...new Set((pastItems || []).map((i: any) => i.procurement_id).filter(Boolean))];

    const [{ data: pastOrders }, { data: grns }, { data: feedback }] = await Promise.all([
      pastPoIds.length
        ? supabase
            .from("procurement_orders")
            .select("id, po_number, requisition_number, order_date, status, vendor_id, site_id, payment_terms, expected_delivery_date, source_type")
            .in("id", pastPoIds)
        : Promise.resolve({ data: [] as any[] }),
      pastPoIds.length
        ? supabase.from("procurement_grns").select("id, po_id, vendor_id, receipt_date, status").in("po_id", pastPoIds)
        : Promise.resolve({ data: [] as any[] }),
      supabase.from("procurement_vendor_feedback").select("vendor_id, overall_experience, improvement_areas, created_at"),
    ]);

    const orderById = new Map((pastOrders || []).map((o: any) => [o.id, o]));
    // Only learn from orders that actually progressed (a rejected requisition is not evidence).
    const usablePast = (pastItems || []).filter((i: any) => {
      const o = orderById.get(i.procurement_id);
      return o && o.status !== "Rejected" && o.source_type !== "internal_transfer";
    });

    const vendorIdSet = new Set<string>();
    usablePast.forEach((i: any) => {
      const o = orderById.get(i.procurement_id);
      const v = i.rate_source_vendor_id || o?.vendor_id || (Array.isArray(i.vendor_ids) && i.vendor_ids.length === 1 ? i.vendor_ids[0] : null);
      if (v) vendorIdSet.add(v);
    });
    (feedback || []).forEach((f: any) => f.vendor_id && vendorIdSet.add(f.vendor_id));

    const siteIdSet = new Set<string>();
    (pastOrders || []).forEach((o: any) => o.site_id && siteIdSet.add(o.site_id));
    if (order.site_id) siteIdSet.add(order.site_id);

    const [{ data: vendorRows }, { data: siteRows }] = await Promise.all([
      vendorIdSet.size
        ? supabase.from("vendors").select("id, name, status, category, gst_number").in("id", [...vendorIdSet])
        : Promise.resolve({ data: [] as any[] }),
      siteIdSet.size
        ? supabase.from("project_sites").select("id, site_name").in("id", [...siteIdSet])
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const vendorById = new Map((vendorRows || []).map((v: any) => [v.id, v]));
    const siteName = (id: string | null) => (id ? (siteRows || []).find((s: any) => s.id === id)?.site_name || null : null);

    /* ---------------- Vendor reputation rollup ---------------- */
    const vendorRep = new Map<string, { rating: number | null; reviews: number; negative: number | null; areas: Record<string, number> }>();
    for (const vid of vendorIdSet) {
      const fbs = (feedback || []).filter((f: any) => f.vendor_id === vid && f.overall_experience != null);
      if (!fbs.length) {
        vendorRep.set(vid, { rating: null, reviews: 0, negative: null, areas: {} });
        continue;
      }
      const stars = fbs.map((f: any) => Number(f.overall_experience));
      const areas: Record<string, number> = {};
      fbs.forEach((f: any) => (f.improvement_areas || []).forEach((a: string) => { areas[a] = (areas[a] || 0) + 1; }));
      const penalties = fbs.map((f: any) => feedbackPenalty(Number(f.overall_experience), f.improvement_areas || []));
      vendorRep.set(vid, {
        rating: round(stars.reduce((a, b) => a + b, 0) / stars.length, 1),
        reviews: fbs.length,
        negative: Math.round((penalties.reduce((a, b) => a + b, 0) / penalties.length / 60) * 100),
        areas,
      });
    }

    // Delivery performance is measured per PO: order date -> first goods receipt.
    const grnByPo = new Map<string, any[]>();
    (grns || []).forEach((g: any) => {
      const list = grnByPo.get(g.po_id) || [];
      list.push(g);
      grnByPo.set(g.po_id, list);
    });

    /* ---------------- Per-product history ---------------- */
    const monthName = (d: string) => new Date(d).toLocaleString("en-GB", { month: "short" });

    const analysis = productIds.map((pid) => {
      const product = (products || []).find((p: any) => p.id === pid);
      const line = items.find((i: any) => i.product_id === pid);
      const history = usablePast.filter((i: any) => i.product_id === pid);

      const purchases = history.map((i: any) => {
        const o = orderById.get(i.procurement_id);
        const vId = i.rate_source_vendor_id || o?.vendor_id || (Array.isArray(i.vendor_ids) && i.vendor_ids.length === 1 ? i.vendor_ids[0] : null);
        const receipts = (grnByPo.get(i.procurement_id) || []).filter((g: any) => g.receipt_date);
        const firstReceipt = receipts.sort((a: any, b: any) => a.receipt_date.localeCompare(b.receipt_date))[0];
        const leadDays = o?.order_date && firstReceipt
          ? Math.max(0, Math.round((new Date(firstReceipt.receipt_date).getTime() - new Date(o.order_date).getTime()) / 86400000))
          : null;
        const promisedLate = o?.expected_delivery_date && firstReceipt
          ? firstReceipt.receipt_date > o.expected_delivery_date
          : null;
        return {
          po_number: o?.po_number || o?.requisition_number || null,
          date: o?.order_date || null,
          month: o?.order_date ? monthName(o.order_date) : null,
          site: siteName(o?.site_id || null),
          vendor_id: vId,
          vendor: vId ? vendorById.get(vId)?.name || null : null,
          rate: round(num(i.rate)),
          qty: round(num(i.qty), 3),
          uom: i.uom || product?.default_uom || null,
          gst_percent: i.gst_percent == null ? null : num(i.gst_percent),
          payment_terms: o?.payment_terms || null,
          lead_time_days: leadDays,
          delivered_late: promisedLate,
          status: o?.status || null,
        };
      }).filter((p) => p.rate > 0);

      purchases.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

      const rates = purchases.map((p) => p.rate);
      const leadTimes = purchases.map((p) => p.lead_time_days).filter((v): v is number => v != null);

      // Vendor-level rollup for this specific product.
      const byVendor = new Map<string, any>();
      purchases.forEach((p) => {
        if (!p.vendor_id) return;
        const cur = byVendor.get(p.vendor_id) || { vendor_id: p.vendor_id, vendor: p.vendor, rates: [], leads: [], late: 0, delivered: 0, last_date: null as string | null, last_rate: 0, qty: 0, terms: [] as string[] };
        cur.rates.push(p.rate);
        cur.qty += p.qty;
        if (p.lead_time_days != null) cur.leads.push(p.lead_time_days);
        if (p.delivered_late != null) { cur.delivered += 1; if (p.delivered_late) cur.late += 1; }
        if (p.payment_terms) cur.terms.push(p.payment_terms);
        if (!cur.last_date || (p.date || "") > cur.last_date) { cur.last_date = p.date; cur.last_rate = p.rate; }
        byVendor.set(p.vendor_id, cur);
      });

      const vendorStats = [...byVendor.values()].map((v) => {
        const rep = vendorRep.get(v.vendor_id) || { rating: null, reviews: 0, negative: null, areas: {} };
        return {
          vendor_id: v.vendor_id,
          vendor: v.vendor || vendorById.get(v.vendor_id)?.name || "Unknown vendor",
          vendor_status: vendorById.get(v.vendor_id)?.status || null,
          times_purchased: v.rates.length,
          total_qty: round(v.qty, 3),
          avg_rate: round(v.rates.reduce((a: number, b: number) => a + b, 0) / v.rates.length),
          best_rate: round(Math.min(...v.rates)),
          last_rate: round(v.last_rate),
          last_purchased: v.last_date,
          avg_lead_time_days: v.leads.length ? Math.round(v.leads.reduce((a: number, b: number) => a + b, 0) / v.leads.length) : null,
          on_time_pct: v.delivered ? Math.round(((v.delivered - v.late) / v.delivered) * 100) : null,
          common_payment_terms: v.terms.length
            ? Object.entries(v.terms.reduce((acc: Record<string, number>, t: string) => { acc[t] = (acc[t] || 0) + 1; return acc; }, {}))
                .sort((a, b) => b[1] - a[1])[0][0]
            : null,
          rating: rep.rating,
          reviews: rep.reviews,
          negative_score: rep.negative,
          improvement_areas: Object.keys(rep.areas),
        };
      }).sort((a, b) => b.times_purchased - a.times_purchased);

      const termCounts: Record<string, number> = {};
      purchases.forEach((p) => { if (p.payment_terms) termCounts[p.payment_terms] = (termCounts[p.payment_terms] || 0) + 1; });

      const monthCounts: Record<string, number> = {};
      purchases.forEach((p) => { if (p.month) monthCounts[p.month] = (monthCounts[p.month] || 0) + 1; });

      const otherSites = [...new Set(purchases.map((p) => p.site).filter(Boolean))];

      return {
        product_id: pid,
        product: product?.product_name || "Unknown product",
        requested_qty: round(num(line?.qty), 3),
        requested_uom: line?.uom || product?.default_uom || null,
        current_rate: round(num(line?.rate)),
        budgeted_rate: product?.budgeted_rate == null ? null : round(num(product.budgeted_rate)),
        catalog_lead_time_days: product?.lead_time_days ?? null,
        history_count: purchases.length,
        price: rates.length
          ? {
              lowest: round(Math.min(...rates)),
              highest: round(Math.max(...rates)),
              average: round(rates.reduce((a, b) => a + b, 0) / rates.length),
              median: round(median(rates)),
              last_paid: purchases[0].rate,
              last_paid_on: purchases[0].date,
              last_paid_vendor: purchases[0].vendor,
            }
          : null,
        avg_lead_time_days: leadTimes.length ? Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length) : null,
        payment_terms_seen: Object.entries(termCounts).sort((a, b) => b[1] - a[1]).map(([t, c]) => ({ terms: t, count: c })),
        buying_months: Object.entries(monthCounts).sort((a, b) => b[1] - a[1]).map(([m, c]) => ({ month: m, count: c })),
        other_sites: otherSites,
        vendors: vendorStats,
        recent_purchases: purchases.slice(0, 8),
      };
    });

    const totalHistory = analysis.reduce((a, b) => a + b.history_count, 0);

    /* ---------------- AI reasoning layer ---------------- */
    const context = {
      requisition: {
        number: order.requisition_number || order.po_number,
        name: order.requisition_name,
        status: order.status,
        raised_on: order.order_date,
        site: siteName(order.site_id),
        needed_by: order.expected_delivery_date,
        current_payment_terms: order.payment_terms,
        estimated_budget: order.estimated_budget,
      },
      today: new Date().toISOString().slice(0, 10),
      products: analysis,
    };

    const system = `You are a senior procurement sourcing analyst for an Indian construction/infrastructure company.
You advise procurement executives on intelligent sourcing using ONLY the historical purchase data supplied.
All amounts are Indian Rupees (INR). Never invent vendors, prices, dates or facts that are not in the data.
If history for a product is empty or thin, say so plainly and give guidance based on the catalog budgeted rate or general best practice, clearly flagged as low confidence.
Respond in JSON only.`;

    const schemaHint = `Return JSON with exactly this shape:
{
  "summary": "2-3 sentence executive summary of the sourcing opportunity for this requisition",
  "estimated_savings_note": "short sentence quantifying potential saving vs the last paid / current rate, or null",
  "timing": "when to buy and why, referencing past buying months and lead times",
  "risks": ["short risk bullet", "..."],
  "items": [
    {
      "product_id": "uuid from the data",
      "product": "product name",
      "recommended_vendor": "vendor name or null",
      "vendor_rationale": "why this vendor - reference times purchased, rating, on-time %, negative score",
      "alternate_vendor": "second-best vendor name or null",
      "target_rate": number or null,
      "price_rationale": "why this price - reference lowest/median/last paid",
      "price_band": "e.g. 'INR 420 - 465 per bag'",
      "recommended_payment_terms": "terms string or null",
      "expected_lead_time_days": number or null,
      "order_by_date": "YYYY-MM-DD or null - latest date to place the order to meet the need-by date",
      "confidence": "high" | "medium" | "low",
      "watchouts": ["short bullet", "..."]
    }
  ]
}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `${schemaHint}\n\nHistorical sourcing data (JSON):\n${JSON.stringify(context)}`,
          },
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
    let advice: any = null;
    try {
      advice = JSON.parse(aiJson?.choices?.[0]?.message?.content ?? "{}");
    } catch (e) {
      console.error("Failed to parse AI content", e);
      return json({ error: "AI returned an unreadable response. Please retry." }, 502);
    }

    return json({
      generated_at: new Date().toISOString(),
      history_records: totalHistory,
      requisition: context.requisition,
      analysis,
      advice,
    });
  } catch (err) {
    console.error("ai-sourcing-advisor failed:", err);
    return json({ error: (err as Error).message || "Unexpected error" }, 500);
  }
});
