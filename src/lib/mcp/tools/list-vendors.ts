import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthenticated, jsonResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_vendors",
  title: "List vendors",
  description: "List vendors from Master Data with category, status, GST number and address. Optionally search by name.",
  inputSchema: {
    search: z.string().trim().optional().describe("Case-insensitive match on vendor name."),
    status: z.string().trim().optional().describe("Filter by vendor status."),
    limit: z.number().int().optional().describe("Max rows to return (1-100, default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const take = Math.min(Math.max(limit ?? 25, 1), 100);
    let query = supabaseForUser(ctx)
      .from("vendors")
      .select("id, name, category, status, gst_number, address, services")
      .order("name")
      .limit(take);
    if (search) query = query.ilike("name", `%${search}%`);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return jsonResult({ count: data?.length ?? 0, vendors: data ?? [] });
  },
});
