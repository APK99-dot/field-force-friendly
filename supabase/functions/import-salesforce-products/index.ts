import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/salesforce";

interface SalesforceProduct {
  Id: string;
  Name: string | null;
  Product_Description__c: string | null;
  Budgeted_rate_per_unit__c: number | null;
  Lead_Time__c: number | null;
  UOM__c: string | null;
  Quality_instruction__c: string | null;
  Delivery_instruction__c: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SALESFORCE_API_KEY = Deno.env.get("SALESFORCE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY || !SALESFORCE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Salesforce connector is not configured." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return new Response(
        JSON.stringify({ error: "Server is not configured." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- Verify caller is an authenticated admin ----
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const uid = userData.user.id;

    const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
      _user_id: uid,
      _role: "admin",
    });
    if (roleErr || !isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Fetch all Products from Salesforce (paginated) ----
    const fields = [
      "Id", "Name", "Product_Description__c", "Budgeted_rate_per_unit__c",
      "Lead_Time__c", "UOM__c", "Quality_instruction__c", "Delivery_instruction__c",
    ].join(", ");

    const soql = `SELECT ${fields} FROM Product__c`;

    const records: SalesforceProduct[] = [];
    let nextPath: string | null = `/query?q=${encodeURIComponent(soql)}`;

    while (nextPath) {
      const resp = await fetch(`${GATEWAY_URL}${nextPath}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": SALESFORCE_API_KEY,
        },
      });
      const json = await resp.json();
      if (!resp.ok) {
        return new Response(
          JSON.stringify({ error: `Salesforce query failed [${resp.status}]`, details: json }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      records.push(...(json.records ?? []));
      if (json.nextRecordsUrl) {
        nextPath = json.nextRecordsUrl.replace("/services/data/v62.0", "");
      } else {
        nextPath = null;
      }
    }

    // ---- Load existing products for de-dup ----
    const { data: existing, error: exErr } = await admin
      .from("master_products")
      .select("id, salesforce_id");
    if (exErr) throw exErr;
    const bySalesforceId = new Map<string, string>();
    for (const p of existing ?? []) {
      if (p.salesforce_id) bySalesforceId.set(p.salesforce_id, p.id);
    }

    let added = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    const clean = (v: string | null) => {
      if (v === null || v === undefined) return null;
      const t = String(v).trim();
      return t === "" ? null : t;
    };

    for (const p of records) {
      const name = (p.Name ?? "").trim();
      if (!name) {
        skipped++;
        continue;
      }

      const row: Record<string, unknown> = {
        product_name: name,
        default_uom: clean(p.UOM__c),
        product_description: clean(p.Product_Description__c),
        budgeted_rate: p.Budgeted_rate_per_unit__c ?? null,
        lead_time_days: p.Lead_Time__c ?? null,
        quality_instruction: clean(p.Quality_instruction__c),
        delivery_instruction: clean(p.Delivery_instruction__c),
        salesforce_id: p.Id,
      };

      const existingId = bySalesforceId.get(p.Id);
      if (existingId) {
        const { error } = await admin.from("master_products").update(row).eq("id", existingId);
        if (error) {
          errors.push(`${name}: ${error.message}`);
          skipped++;
        } else {
          updated++;
        }
      } else {
        row.created_by = uid;
        row.is_active = true;
        const { error } = await admin.from("master_products").insert(row);
        if (error) {
          errors.push(`${name}: ${error.message}`);
          skipped++;
        } else {
          added++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        total: records.length,
        added,
        updated,
        skipped,
        errors: errors.slice(0, 20),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message ?? "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
