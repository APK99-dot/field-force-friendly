import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthenticated, jsonResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_activities",
  title: "List field activities",
  description: "List field activities (site visits, tasks, GRN events) with date, type, site, status and check-in details.",
  inputSchema: {
    from_date: z.string().trim().optional().describe("Earliest activity date, YYYY-MM-DD."),
    to_date: z.string().trim().optional().describe("Latest activity date, YYYY-MM-DD."),
    site_id: z.string().trim().optional().describe("Filter to one site id."),
    mine_only: z.boolean().optional().describe("Only activities created by me. Defaults to false."),
    limit: z.number().int().optional().describe("Max rows to return (1-100, default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from_date, to_date, site_id, mine_only, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const take = Math.min(Math.max(limit ?? 25, 1), 100);
    let query = supabaseForUser(ctx)
      .from("activity_events")
      .select(
        "id, activity_code, activity_name, activity_type, activity_date, status, site_id, project_id, location_address, check_in_at, check_out_at, remarks",
      )
      .order("activity_date", { ascending: false })
      .limit(take);
    if (from_date) query = query.gte("activity_date", from_date);
    if (to_date) query = query.lte("activity_date", to_date);
    if (site_id) query = query.eq("site_id", site_id);
    if (mine_only) query = query.eq("created_by", ctx.getUserId());
    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return jsonResult({ count: data?.length ?? 0, activities: data ?? [] });
  },
});
