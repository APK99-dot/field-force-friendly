import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthenticated, jsonResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_procurement_orders",
  title: "List requisitions and purchase orders",
  description: "List procurement requisitions / purchase orders with number, status, site, budget and delivery date.",
  inputSchema: {
    status: z.string().trim().optional().describe("Exact status, e.g. 'Requisition', 'PO Issued', 'Paid'."),
    search: z.string().trim().optional().describe("Match on requisition name, requisition number or PO number."),
    source_type: z.string().trim().optional().describe("'vendor' for vendor purchase or 'transfer' for internal transfer."),
    limit: z.number().int().optional().describe("Max rows to return (1-100, default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, search, source_type, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const take = Math.min(Math.max(limit ?? 25, 1), 100);
    let query = supabaseForUser(ctx)
      .from("procurement_orders")
      .select(
        "id, requisition_number, po_number, requisition_name, status, source_type, order_date, expected_delivery_date, estimated_budget, site_id, bill_to, ship_to, payment_terms",
      )
      .order("order_date", { ascending: false })
      .limit(take);
    if (status) query = query.eq("status", status);
    if (source_type) query = query.eq("source_type", source_type);
    if (search) {
      query = query.or(
        `requisition_name.ilike.%${search}%,requisition_number.ilike.%${search}%,po_number.ilike.%${search}%`,
      );
    }
    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return jsonResult({ count: data?.length ?? 0, orders: data ?? [] });
  },
});
