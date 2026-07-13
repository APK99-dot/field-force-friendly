import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const ItemSchema = z.object({
  procurement_item_id: z.string().uuid(),
  rate: z.number().min(0).max(1_000_000_000),
  discount_pct: z.number().min(0).max(100),
  delivery_commitment_date: z.string().max(20).nullable().optional(),
  is_selected: z.boolean(),
});

const BodySchema = z.object({
  token: z.string().min(8).max(128),
  vendor_payment_term: z.string().max(500).optional().default(""),
  notes: z.string().max(2000).optional().default(""),
  submit: z.boolean().optional().default(false),
  items: z.array(ItemSchema).max(500),
});

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
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors }, 400);
    }
    const { token, vendor_payment_term, notes, submit, items } = parsed.data;

    const { data: quote, error: qErr } = await supabase
      .from("procurement_vendor_quotes")
      .select("id, status")
      .eq("token", token)
      .maybeSingle();
    if (qErr) throw qErr;
    if (!quote) return json({ error: "This quote link is not valid." }, 404);
    if (quote.status === "submitted") {
      return json({ error: "This quote has already been submitted." }, 409);
    }

    // Validate the line items belong to this quote's requisition
    const { data: poRow } = await supabase
      .from("procurement_vendor_quotes")
      .select("po_id")
      .eq("id", quote.id)
      .maybeSingle();
    const { data: validItems } = await supabase
      .from("procurement_items")
      .select("id")
      .eq("procurement_id", poRow?.po_id);
    const validIds = new Set((validItems || []).map((i) => i.id));

    for (const it of items) {
      if (!validIds.has(it.procurement_item_id)) continue;
      const rateAfter = Number((it.rate * (1 - it.discount_pct / 100)).toFixed(2));
      const payload = {
        quote_id: quote.id,
        procurement_item_id: it.procurement_item_id,
        rate: it.rate,
        discount_pct: it.discount_pct,
        rate_after_discount: rateAfter,
        delivery_commitment_date: it.delivery_commitment_date || null,
        is_selected: it.is_selected,
      };
      const { error: upErr } = await supabase
        .from("procurement_vendor_quote_items")
        .upsert(payload, { onConflict: "quote_id,procurement_item_id" });
      if (upErr) throw upErr;
    }

    const update: Record<string, unknown> = {
      vendor_payment_term,
      notes,
    };
    if (submit) {
      update.status = "submitted";
      update.submitted_at = new Date().toISOString();
    }
    const { error: updErr } = await supabase
      .from("procurement_vendor_quotes")
      .update(update)
      .eq("id", quote.id);
    if (updErr) throw updErr;

    return json({ ok: true, submitted: !!submit });
  } catch (err) {
    console.error("submit-vendor-quote error:", err);
    return json({ error: "Failed to submit quote", details: String(err) }, 500);
  }
});
