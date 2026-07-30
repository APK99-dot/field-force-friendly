import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthenticated, jsonResult, errorResult } from "../supabase";

export default defineTool({
  name: "my_attendance",
  title: "My attendance",
  description: "Return the signed-in user's attendance records (date, status, check-in/out times, hours) for a date range.",
  inputSchema: {
    from_date: z.string().trim().optional().describe("Start date, YYYY-MM-DD."),
    to_date: z.string().trim().optional().describe("End date, YYYY-MM-DD."),
    limit: z.number().int().optional().describe("Max rows to return (1-100, default 31)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from_date, to_date, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const take = Math.min(Math.max(limit ?? 31, 1), 100);
    let query = supabaseForUser(ctx)
      .from("attendance")
      .select("date, status, check_in_time, check_out_time, total_hours, check_in_address, check_out_address, notes")
      .eq("user_id", ctx.getUserId())
      .order("date", { ascending: false })
      .limit(take);
    if (from_date) query = query.gte("date", from_date);
    if (to_date) query = query.lte("date", to_date);
    const { data, error } = await query;
    if (error) return errorResult(error.message);
    const totalHours = (data ?? []).reduce((sum, row) => sum + (Number(row.total_hours) || 0), 0);
    return jsonResult({ count: data?.length ?? 0, total_hours: Number(totalHours.toFixed(2)), records: data ?? [] });
  },
});
