import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token")?.trim() ?? "";
    if (!token || token.length < 8 || token.length > 128) {
      return json({ error: "Invalid link" }, 400);
    }

    // Look up the quote by its secret token
    const { data: quote, error: qErr } = await supabase
      .from("procurement_vendor_quotes")
      .select("*")
      .eq("token", token)
      .maybeSingle();
    if (qErr) throw qErr;
    if (!quote) return json({ error: "This quote link is not valid." }, 404);

    // Order / requisition
    const { data: order, error: oErr } = await supabase
      .from("procurement_orders")
      .select(
        "id, po_number, order_date, site_id, expected_delivery_date, payment_terms, bill_to, ship_to, bill_to_gst, ship_to_gst, requisition_notes, status, terms_and_conditions",
      )
      .eq("id", quote.po_id)
      .maybeSingle();
    if (oErr) throw oErr;
    if (!order) return json({ error: "Requisition not found." }, 404);

    // Terms & Conditions: prefer per-requisition terms; fallback to global config
    let termsAndConditions: string[] = Array.isArray((order as any).terms_and_conditions)
      ? ((order as any).terms_and_conditions as unknown[]).filter((t) => typeof t === "string" && (t as string).trim()) as string[]
      : [];
    if (termsAndConditions.length === 0) {
      const { data: tcRow } = await supabase
        .from("app_configuration")
        .select("config_value")
        .eq("module", "procurement")
        .eq("config_key", "termsAndConditions")
        .maybeSingle();
      if (Array.isArray(tcRow?.config_value)) {
        termsAndConditions = (tcRow!.config_value as unknown[]).filter((t) => typeof t === "string" && (t as string).trim()) as string[];
      }
    }


    // Requisition title comes from notes' first line fallback to PO number
    const reqTitle = order.po_number || "Requisition";

    // Line items — scope to the specific items this vendor was invited to quote.
    // Legacy quotes with no invited list fall back to all items of the PO.
    let itemsQuery = supabase
      .from("procurement_items")
      .select("id, product_id, qty, uom, gst_percent")
      .eq("procurement_id", quote.po_id)
      .order("created_at");
    const invitedIds: string[] = Array.isArray(quote.procurement_item_ids)
      ? quote.procurement_item_ids.filter(Boolean)
      : [];
    if (invitedIds.length) {
      itemsQuery = itemsQuery.in("id", invitedIds);
    }
    const { data: items, error: iErr } = await itemsQuery;
    if (iErr) throw iErr;

    const productIds = [...new Set((items || []).map((i) => i.product_id).filter(Boolean))];
    let productMap: Record<string, any> = {};
    if (productIds.length) {
      const { data: products } = await supabase
        .from("master_products")
        .select("id, product_name, product_description, quality_instruction, default_uom")
        .in("id", productIds as string[]);
      (products || []).forEach((p) => { productMap[p.id] = p; });
    }

    // Site name
    let siteName = "";
    const siteAddress = "";
    if (order.site_id) {
      const { data: site } = await supabase
        .from("project_sites")
        .select("site_name")
        .eq("id", order.site_id)
        .maybeSingle();
      siteName = site?.site_name || "";
    }

    // Vendor
    let vendor: any = null;
    if (quote.vendor_id) {
      const { data: v } = await supabase
        .from("vendors")
        .select("id, name, contact_person, address, gst_number")
        .eq("id", quote.vendor_id)
        .maybeSingle();
      vendor = v;
    }

    // Company profile (branding)
    const { data: companyRows } = await supabase
      .from("company_profile")
      .select("company_name, logo_url, address");
    const company =
      (companyRows || []).find((c: any) => c.logo_url && String(c.logo_url).trim() !== "") ||
      (companyRows || [])[0] ||
      null;

    // Any previously saved response
    const { data: savedItems } = await supabase
      .from("procurement_vendor_quote_items")
      .select("*")
      .eq("quote_id", quote.id);
    const savedMap: Record<string, any> = {};
    (savedItems || []).forEach((s) => { if (s.procurement_item_id) savedMap[s.procurement_item_id] = s; });

    const lineItems = (items || []).map((it) => {
      const p = it.product_id ? productMap[it.product_id] : null;
      const saved = savedMap[it.id];
      return {
        procurement_item_id: it.id,
        product_name: p?.product_name || "-",
        product_description: p?.product_description || "",
        quality_instruction: p?.quality_instruction || "",
        qty: Number(it.qty || 0),
        uom: it.uom || p?.default_uom || "",
        expected_delivery_date: order.expected_delivery_date || null,
        rate: saved ? Number(saved.rate) : null,
        discount_pct: saved ? Number(saved.discount_pct) : 0,
        gst_percent: saved ? Number(saved.gst_percent || 0) : Number(it.gst_percent || 0),
        rate_after_discount: saved ? Number(saved.rate_after_discount) : null,
        delivery_commitment_date: saved?.delivery_commitment_date || null,
        quality_notes: saved?.quality_notes || "",
        is_selected: saved ? saved.is_selected : true,
      };
    });

    return json({
      status: quote.status,
      submitted_at: quote.submitted_at,
      first_submitted_at: quote.first_submitted_at || null,
      last_resubmitted_at: quote.last_resubmitted_at || null,
      reopened_at: quote.reopened_at || null,
      vendor_payment_term: quote.vendor_payment_term || "",
      notes: quote.notes || "",
      change_request_notes: quote.change_request_notes || "",
      attachments: Array.isArray(quote.attachments) ? quote.attachments : [],
      terms_and_conditions: termsAndConditions,
      terms_accepted_at: quote.terms_accepted_at || null,
      term_responses: Array.isArray(quote.term_responses) ? quote.term_responses : [],
      requisition: {
        title: reqTitle,
        po_number: order.po_number,
        order_date: order.order_date,
        expected_payment_terms: order.payment_terms || "",
        bill_to: order.bill_to || "",
        ship_to: order.ship_to || "",
        bill_to_gst: order.bill_to_gst || "",
        ship_to_gst: order.ship_to_gst || "",
        site_name: siteName,
        site_address: siteAddress,
      },
      vendor: vendor
        ? { name: vendor.name, contact_person: vendor.contact_person, address: vendor.address, gst_number: vendor.gst_number }
        : null,
      company: company
        ? { company_name: company.company_name, logo_url: company.logo_url, address: company.address }
        : null,
      items: lineItems,
    });

  } catch (err) {
    console.error("get-vendor-quote error:", err);
    return json({ error: "Failed to load quote", details: String(err) }, 500);
  }
});
