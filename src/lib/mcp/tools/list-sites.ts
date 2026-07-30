import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthenticated, jsonResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_sites",
  title: "List sites",
  description: "List project sites with status, code, dates and base address. Optionally search by name and include inactive sites.",
  inputSchema: {
    search: z.string().trim().optional().describe("Case-insensitive match on site name or code."),
    include_inactive: z.boolean().optional().describe("Include inactive sites. Defaults to false."),
    limit: z.number().int().optional().describe("Max rows to return (1-100, default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, include_inactive, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const take = Math.min(Math.max(limit ?? 25, 1), 100);
    let query = supabaseForUser(ctx)
      .from("project_sites")
      .select("id, site_name, site_code, status, flag, start_date, end_date, base_address, is_active")
      .is("deleted_at", null)
      .order("site_name")
      .limit(take);
    if (!include_inactive) query = query.eq("is_active", true);
    if (search) query = query.or(`site_name.ilike.%${search}%,site_code.ilike.%${search}%`);
    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return jsonResult({ count: data?.length ?? 0, sites: data ?? [] });
  },
});
