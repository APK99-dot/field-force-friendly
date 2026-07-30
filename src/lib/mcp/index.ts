import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import listSitesTool from "./tools/list-sites";
import listActivitiesTool from "./tools/list-activities";
import myAttendanceTool from "./tools/my-attendance";
import listProcurementOrdersTool from "./tools/list-procurement-orders";
import listVendorsTool from "./tools/list-vendors";
import myExpensesTool from "./tools/my-expenses";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "bharath-builders",
  title: "Bharath Builders",
  version: "0.1.0",
  instructions:
    "Read-only tools for the Bharath Builders field-force app. Use `whoami` to identify the signed-in user, `list_sites` for project sites, `list_activities` for field activities and site visits, `my_attendance` for the user's attendance records, `my_expenses` for their expense claims, and `list_procurement_orders` / `list_vendors` for procurement data. All data is scoped to the signed-in user's permissions.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    whoamiTool,
    listSitesTool,
    listActivitiesTool,
    myAttendanceTool,
    myExpensesTool,
    listProcurementOrdersTool,
    listVendorsTool,
  ],
});
