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
  quality_notes: z.string().max(1000).nullable().optional(),
  is_selected: z.boolean(),
});

const AttachmentSchema = z.object({
  name: z.string().max(300),
  url: z.string().url().max(1000),
  size: z.number().min(0).max(50 * 1024 * 1024),
  type: z.string().max(200),
});

const TermResponseSchema = z.object({
  term: z.string().max(2000),
  response: z.enum(["accept", "change"]),
  comment: z.string().max(2000).optional().default(""),
});

const BodySchema = z.object({
  token: z.string().min(8).max(128),
  vendor_payment_term: z.string().max(500).optional().default(""),
  notes: z.string().max(2000).optional().default(""),
  mode: z.enum(["draft", "accept", "request_changes"]).default("draft"),
  terms_accepted: z.boolean().optional().default(false),
  change_request_notes: z.string().max(2000).optional().default(""),
  attachments: z.array(AttachmentSchema).max(20).optional().default([]),
  term_responses: z.array(TermResponseSchema).max(100).optional().default([]),
  items: z.array(ItemSchema).max(500),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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
    const {
      token, vendor_payment_term, notes, mode, terms_accepted,
      change_request_notes, attachments, items,
    } = parsed.data;

    const { data: quote, error: qErr } = await supabase
      .from("procurement_vendor_quotes")
      .select("id, status, po_id, vendor_id, first_submitted_at")
      .eq("token", token)
      .maybeSingle();
    if (qErr) throw qErr;
    if (!quote) return json({ error: "This quote link is not valid." }, 404);
    // Editable states: draft, reopened, changes_requested (legacy: pending)
    if (quote.status === "submitted") {
      return json({ error: "This quote has already been submitted. Ask the buyer to reopen it if changes are needed." }, 409);
    }

    if (mode === "accept" && !terms_accepted) {
      return json({ error: "You must accept the Terms & Conditions before submitting." }, 400);
    }
    if (mode === "request_changes" && !change_request_notes.trim()) {
      return json({ error: "Please describe the changes you are requesting." }, 400);
    }

    // Validate items belong to this quote's requisition
    const { data: validItems } = await supabase
      .from("procurement_items")
      .select("id")
      .eq("procurement_id", quote.po_id);
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
        quality_notes: it.quality_notes ?? null,
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
      attachments,
    };
    if (mode === "accept") {
      const nowIso = new Date().toISOString();
      update.status = "submitted";
      update.submitted_at = nowIso;
      update.terms_accepted_at = nowIso;
      if (quote.first_submitted_at) {
        update.last_resubmitted_at = nowIso;
      } else {
        update.first_submitted_at = nowIso;
      }
    } else if (mode === "request_changes") {
      update.status = "changes_requested";
      update.submitted_at = new Date().toISOString();
      update.change_request_notes = change_request_notes;
    }
    const { error: updErr } = await supabase
      .from("procurement_vendor_quotes")
      .update(update)
      .eq("id", quote.id);
    if (updErr) throw updErr;

    // Auto-advance PO stage on vendor submission (Quote Requested -> Quote Received),
    // attributing the transition to the vendor in the stage history.
    if (mode === "accept") {
      try {
        const STATUS_FLOW = [
          "Requisition", "Requisition Approved", "Quote Requested", "Quote Received",
          "PO Issued", "Goods Received", "Invoice Received", "Paid", "Closed",
        ];
        const { data: po } = await supabase
          .from("procurement_orders")
          .select("id, status, source_type, stage_history")
          .eq("id", quote.po_id)
          .maybeSingle();
        if (po && po.source_type !== "internal_transfer") {
          const curIdx = STATUS_FLOW.indexOf(po.status as string);
          // Vendor submission implies at least Quote Requested + Quote Received.
          const targets: { stage: string; idx: number }[] = [
            { stage: "Quote Requested", idx: STATUS_FLOW.indexOf("Quote Requested") },
            { stage: "Quote Received", idx: STATUS_FLOW.indexOf("Quote Received") },
          ].filter((t) => t.idx > curIdx);
          if (targets.length && po.status !== "Closed" && po.status !== "Rejected" && po.status !== "Requisition") {
            const target = targets[targets.length - 1];
            const { data: vendorRow } = quote.vendor_id
              ? await supabase.from("vendors").select("name").eq("id", quote.vendor_id).maybeSingle()
              : { data: null as any };
            const actor = vendorRow?.name || "Vendor";
            const history = Array.isArray(po.stage_history) ? [...(po.stage_history as any[])] : [];
            history.push({
              status: target.stage,
              moved_by: null,
              moved_by_name: actor,
              moved_at: new Date().toISOString(),
              note: `${actor} submitted a quote`,
              auto: true,
            });
            await supabase.from("procurement_orders")
              .update({ status: target.stage, stage_history: history })
              .eq("id", po.id);
          }
        }
      } catch (e) {
        console.error("auto-advance on quote submit failed", e);
      }
    }

    // Notify requisition owner on change request
    if (mode === "request_changes") {
      try {
        const { data: order } = await supabase
          .from("procurement_orders")
          .select("created_by, po_number, requisition_name")
          .eq("id", quote.po_id)
          .maybeSingle();
        const { data: vendorRow } = quote.vendor_id
          ? await supabase.from("vendors").select("name").eq("id", quote.vendor_id).maybeSingle()
          : { data: null as any };
        if (order?.created_by) {
          await supabase.rpc("send_notification", {
            user_id_param: order.created_by,
            title_param: "Vendor requested changes",
            message_param: `${vendorRow?.name || "Vendor"} requested changes on ${order.requisition_name || order.po_number || "requisition"}: ${change_request_notes.slice(0, 200)}`,
            type_param: "warning",
            related_table_param: "procurement_orders",
            related_id_param: quote.po_id,
          });
        }
      } catch (e) {
        console.error("notify change request failed", e);
      }
    }

    return json({ ok: true, mode });
  } catch (err) {
    console.error("submit-vendor-quote error:", err);
    return json({ error: "Failed to submit quote", details: String(err) }, 500);
  }
});
