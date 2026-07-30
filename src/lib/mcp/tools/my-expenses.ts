import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthenticated, jsonResult, errorResult } from "../supabase";

export default defineTool({
  name: "my_expenses",
  title: "My expenses",
  description: "List the signed-in user's expense claims with amount, category, status and date, plus a total.",
  inputSchema: {
    from_date: z.string().trim().optional().describe("Earliest expense date, YYYY-MM-DD."),
    to_date: z.string().trim().optional().describe("Latest expense date, YYYY-MM-DD."),
    status: z.string().trim().optional().describe("Filter by claim status, e.g. 'pending', 'approved'."),
    limit: z.number().int().optional().describe("Max rows to return (1-100, default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from_date, to_date, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const take = Math.min(Math.max(limit ?? 25, 1), 100);
    let query = supabaseForUser(ctx)
      .from("additional_expenses")
      .select("id, expense_date, amount, category, custom_category, description, status, rejection_reason")
      .eq("user_id", ctx.getUserId())
      .order("expense_date", { ascending: false })
      .limit(take);
    if (from_date) query = query.gte("expense_date", from_date);
    if (to_date) query = query.lte("expense_date", to_date);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return errorResult(error.message);
    const total = (data ?? []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    return jsonResult({ count: data?.length ?? 0, total_amount: Number(total.toFixed(2)), expenses: data ?? [] });
  },
});
