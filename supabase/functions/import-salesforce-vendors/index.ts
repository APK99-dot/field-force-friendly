import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/salesforce";

interface SalesforceAccount {
  Id: string;
  Name: string | null;
  Phone: string | null;
  Email_Id__c: string | null;
  Account_Type__c: string | null;
  GST__c: string | null;
  PAN__c: string | null;
  AnnualRevenue: number | null;
  NumberOfEmployees: number | null;
  BillingStreet: string | null;
  BillingCity: string | null;
  BillingState: string | null;
  BillingPostalCode: string | null;
  BillingCountry: string | null;
}

function buildAddress(a: SalesforceAccount): string | null {
  const parts = [
    a.BillingStreet,
    a.BillingCity,
    a.BillingState,
    a.BillingPostalCode,
    a.BillingCountry,
  ]
    .map((p) => (p ? String(p).trim() : ""))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
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

    // ---- Optional filter: only import a specific Account_Type__c ----
    let accountType: string | null = null;
    try {
      const body = await req.json();
      if (body && typeof body.accountType === "string" && body.accountType.trim()) {
        accountType = body.accountType.trim();
      }
    } catch {
      // no body — import everything
    }

    // ---- Fetch all Accounts from Salesforce (paginated) ----
    const fields = [
      "Id", "Name", "Phone", "Email_Id__c", "Account_Type__c",
      "GST__c", "PAN__c", "AnnualRevenue", "NumberOfEmployees",
      "BillingStreet", "BillingCity", "BillingState", "BillingPostalCode", "BillingCountry",
    ].join(", ");

    let soql = `SELECT ${fields} FROM Account`;
    if (accountType) {
      soql += ` WHERE Account_Type__c = '${accountType.replace(/'/g, "\\'")}'`;
    }

    const records: SalesforceAccount[] = [];
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

    // ---- Load existing vendors for de-dup ----
    const { data: existing, error: exErr } = await admin
      .from("vendors")
      .select("id, salesforce_id");
    if (exErr) throw exErr;
    const bySalesforceId = new Map<string, string>();
    for (const v of existing ?? []) {
      if (v.salesforce_id) bySalesforceId.set(v.salesforce_id, v.id);
    }

    let added = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const a of records) {
      const name = (a.Name ?? "").trim();
      if (!name) {
        skipped++;
        continue;
      }

      const row: Record<string, unknown> = {
        name,
        phone: a.Phone ? [String(a.Phone).trim()] : [],
        email: a.Email_Id__c ? [String(a.Email_Id__c).trim()] : [],
        contact_person: [],
        address: buildAddress(a),
        category: a.Account_Type__c ? String(a.Account_Type__c).trim() : null,
        gst_number: a.GST__c ? String(a.GST__c).trim() : null,
        pan_number: a.PAN__c ? String(a.PAN__c).trim() : null,
        annual_revenue: a.AnnualRevenue ?? null,
        employee_count: a.NumberOfEmployees ?? null,
        salesforce_id: a.Id,
      };

      const existingId = bySalesforceId.get(a.Id);
      if (existingId) {
        const { error } = await admin.from("vendors").update(row).eq("id", existingId);
        if (error) {
          errors.push(`${name}: ${error.message}`);
          skipped++;
        } else {
          updated++;
        }
      } else {
        row.created_by = uid;
        row.status = "active";
        const { error } = await admin.from("vendors").insert(row);
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
