import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser, notAuthenticated, jsonResult, errorResult } from "../supabase";

export default defineTool({
  name: "whoami",
  title: "Who am I",
  description: "Return the profile of the signed-in Bharath Builders user (name, username, phone, status).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, username, phone_number, user_status")
      .eq("id", ctx.getUserId())
      .maybeSingle();
    if (error) return errorResult(error.message);
    return jsonResult({ email: ctx.getUserEmail() ?? null, profile: data ?? null });
  },
});
