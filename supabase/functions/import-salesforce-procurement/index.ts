import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/salesforce";

// --------- SF types (partial) ---------
interface SFRequisition {
  Id: string;
  Name: string | null;
  Requisition_name__c: string | null;
  Requisition_Status__c: string | null;
  Requisition_Raised_Date__c: string | null;
  PO_Date__c: string | null;
  Delivery_Due_Date__c: string | null;
  Payment_Terms__c: number | null;
  Budget_Required_Requistion__c: number | null;
  Billing_Location__c: string | null;
  Billing_Location__r?: { Name?: string | null; BillingStreet?: string | null; BillingCity?: string | null; BillingState?: string | null; BillingPostalCode?: string | null } | null;
  Shipping_Location__c: string | null;
  Shipping_Location__r?: { Name?: string | null; ShippingStreet?: string | null; ShippingCity?: string | null; ShippingState?: string | null; ShippingPostalCode?: string | null } | null;
}
interface SFProductReq {
  Id: string; Name: string | null;
  Product__c: string | null;
  Product__r?: { Name?: string | null } | null;
  Quantity__c: number | null;
  UOM__c: string | null;
  Budget_Rate_Product_Requisition__c: number | null;
  Product_Description__c: string | null;
  Expected_Delivery_Date__c: string | null;
  Quality_instruction__c: string | null;
  Delivery_GRN_instruction__c: string | null;
}
interface SFVendorAssigned {
  Id: string; Name: string | null;
  Vendor__c: string | null;
  Vendor__r?: { Name?: string | null; Phone?: string | null } | null;
  Vendors_payment_terms__c: number | null;
  Vendor_Email__c: string | null;
  Final_Decision__c: string | null;
  Vendor_Requisition_Status__c: string | null;
}
interface SFQuoteLine {
  Id: string;
  Vendor_Assigned__c: string | null;
  Vendor_Name__c: string | null; // Account id
  Product_Lookup__c: string | null;
  Product_Requisition__c: string | null;
  Quantity__c: number | null;
  UOM__c: string | null;
  Rate_per_unit__c: number | null;
  Discount__c: number | null;
  Rate_Per_Unit_After_Discount__c: number | null;
  Vendor_Delivery_Commitment_Date__c: string | null;
  Quality_instruction__c: string | null;
}
interface SFPaymentSchedule {
  Id: string;
  Name: string | null;
  Status__c: string | null;
  Amount_Processed__c: number | null;
  Amount_To_Be_Paid__c: number | null;
  Invoice_Date_from_Vendor__c: string | null;
  Payment_Date__c: string | null;
  Payment_Due_Date__c: string | null;
  Payment_cheque_or_reference_number__c: string | null;
  Vendor_List__c: string | null; // → Vendor_Assigned__c Id
}

// Map SF Requisition_Status__c → Lovable procurement_orders.status
function mapStatus(sf: string | null): string {
  switch ((sf || "").toLowerCase()) {
    case "initiated": return "Requisition";
    case "approved": return "Requisition Approved";
    case "vendor list identified": return "Quote Requested";
    case "vendor shortlisted": return "PO Issued";
    default: return "Requisition";
  }
}

async function sfQuery<T = unknown>(soql: string, apiKey: string, gatewayKey: string): Promise<T[]> {
  const results: T[] = [];
  let next: string | null = `/query?q=${encodeURIComponent(soql)}`;
  while (next) {
    const resp = await fetch(`${GATEWAY_URL}${next}`, {
      headers: { Authorization: `Bearer ${gatewayKey}`, "X-Connection-Api-Key": apiKey },
    });
    const json = await resp.json();
    if (!resp.ok) throw new Error(`Salesforce query failed [${resp.status}]: ${JSON.stringify(json).slice(0, 400)}`);
    results.push(...(json.records ?? []));
    next = json.nextRecordsUrl ? json.nextRecordsUrl.replace("/services/data/v62.0", "") : null;
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SALESFORCE_API_KEY = Deno.env.get("SALESFORCE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!LOVABLE_API_KEY || !SALESFORCE_API_KEY || !SUPABASE_URL || !SERVICE_ROLE) {
      return json({ error: "Server or Salesforce connector not configured." }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const salesforceId: string = String(body?.salesforce_id || "").trim();
    if (!salesforceId) return json({ error: "salesforce_id is required" }, 400);

    // ---- Auth: admin only ----
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!token) return json({ error: "Not authenticated" }, 401);
    const { data: userData } = await admin.auth.getUser(token);
    if (!userData?.user) return json({ error: "Not authenticated" }, 401);
    const uid = userData.user.id;
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: uid, _role: "admin" });
    if (!isAdmin) return json({ error: "Admin access required" }, 403);

    const report: Record<string, unknown> = { salesforce_id: salesforceId, steps: [] as unknown[] };
    const step = (label: string, data: Record<string, unknown> = {}) => (report.steps as unknown[]).push({ label, ...data });

    // ---- 1. Load Requisition ----
    const reqRows = await sfQuery<SFRequisition>(
      `SELECT Id, Name, Requisition_name__c, Requisition_Status__c, Requisition_Raised_Date__c, PO_Date__c, Delivery_Due_Date__c, Payment_Terms__c, Budget_Required_Requistion__c, Billing_Location__c, Billing_Location__r.Name, Billing_Location__r.BillingStreet, Billing_Location__r.BillingCity, Billing_Location__r.BillingState, Billing_Location__r.BillingPostalCode, Shipping_Location__c, Shipping_Location__r.Name, Shipping_Location__r.ShippingStreet, Shipping_Location__r.ShippingCity, Shipping_Location__r.ShippingState, Shipping_Location__r.ShippingPostalCode FROM Requistion__c WHERE Id = '${salesforceId}' LIMIT 1`,
      SALESFORCE_API_KEY, LOVABLE_API_KEY,
    );
    if (!reqRows.length) return json({ error: `Requisition ${salesforceId} not found in Salesforce` }, 404);
    const sfReq = reqRows[0];
    step("requisition_loaded", { name: sfReq.Name });

    // ---- 2. Load children in parallel ----
    const [prLines, vas, qlis] = await Promise.all([
      sfQuery<SFProductReq>(
        `SELECT Id, Name, Product__c, Product__r.Name, Quantity__c, UOM__c, Budget_Rate_Product_Requisition__c, Product_Description__c, Expected_Delivery_Date__c, Quality_instruction__c, Delivery_GRN_instruction__c FROM Product_Requisition__c WHERE Requistion__c = '${salesforceId}'`,
        SALESFORCE_API_KEY, LOVABLE_API_KEY,
      ),
      sfQuery<SFVendorAssigned>(
        `SELECT Id, Name, Vendor__c, Vendor__r.Name, Vendor__r.Phone, Vendors_payment_terms__c, Vendor_Email__c, Final_Decision__c, Vendor_Requisition_Status__c FROM Vendor_Assigned__c WHERE Requistion__c = '${salesforceId}'`,
        SALESFORCE_API_KEY, LOVABLE_API_KEY,
      ),
      sfQuery<SFQuoteLine>(
        `SELECT Id, Vendor_Assigned__c, Vendor_Name__c, Product_Lookup__c, Product_Requisition__c, Quantity__c, UOM__c, Rate_per_unit__c, Discount__c, Rate_Per_Unit_After_Discount__c, Vendor_Delivery_Commitment_Date__c, Quality_instruction__c FROM Vendor_Quote_Line_Item__c WHERE Requisition__c = '${salesforceId}'`,
        SALESFORCE_API_KEY, LOVABLE_API_KEY,
      ),
    ]);
    step("children_loaded", { product_reqs: prLines.length, vendors_assigned: vas.length, quote_lines: qlis.length });

    // ---- 3. Resolve/create master_addresses for Bill-to / Ship-to ----
    async function ensureAddress(accId: string | null, name?: string | null): Promise<string | null> {
      if (!accId || !name) return null;
      const { data: found } = await admin.from("master_addresses").select("id").eq("salesforce_id", accId).maybeSingle();
      if (found?.id) return found.id as string;
      const { data: byName } = await admin.from("master_addresses").select("id").ilike("address_name", name).limit(1).maybeSingle();
      if (byName?.id) {
        await admin.from("master_addresses").update({ salesforce_id: accId }).eq("id", byName.id);
        return byName.id as string;
      }
      const { data: inserted, error } = await admin.from("master_addresses")
        .insert({ address_name: name, salesforce_id: accId, created_by: uid })
        .select("id").single();
      if (error) throw new Error(`ensureAddress(${name}): ${error.message}`);
      return inserted!.id as string;
    }

    const billToId = await ensureAddress(sfReq.Billing_Location__c, sfReq.Billing_Location__r?.Name);
    const shipToId = await ensureAddress(sfReq.Shipping_Location__c, sfReq.Shipping_Location__r?.Name);
    step("addresses_resolved", { bill_to_id: billToId, ship_to_id: shipToId });

    // ---- 4. Resolve/create vendors ----
    const vendorMap = new Map<string, string>(); // SF Account Id → vendors.id
    for (const v of vas) {
      const accId = v.Vendor__c;
      if (!accId) continue;
      if (vendorMap.has(accId)) continue;
      const { data: found } = await admin.from("vendors").select("id").eq("salesforce_id", accId).maybeSingle();
      if (found?.id) { vendorMap.set(accId, found.id as string); continue; }
      const name = v.Vendor__r?.Name || v.Name || "Salesforce Vendor";
      const { data: byName } = await admin.from("vendors").select("id").ilike("name", name).limit(1).maybeSingle();
      if (byName?.id) {
        await admin.from("vendors").update({ salesforce_id: accId }).eq("id", byName.id);
        vendorMap.set(accId, byName.id as string);
        continue;
      }
      const email = v.Vendor_Email__c ? [v.Vendor_Email__c] : [];
      const phone = v.Vendor__r?.Phone ? [v.Vendor__r.Phone] : [];
      const { data: inserted, error } = await admin.from("vendors")
        .insert({ name, salesforce_id: accId, created_by: uid, status: "active", phone, email })
        .select("id").single();
      if (error) throw new Error(`create vendor ${name}: ${error.message}`);
      vendorMap.set(accId, inserted!.id as string);
    }
    step("vendors_resolved", { count: vendorMap.size });

    // ---- 5. Resolve/create master_products ----
    const productMap = new Map<string, string>(); // SF Product__c Id → master_products.id
    for (const pr of prLines) {
      const pid = pr.Product__c;
      if (!pid) continue;
      if (productMap.has(pid)) continue;
      const { data: found } = await admin.from("master_products").select("id").eq("salesforce_id", pid).maybeSingle();
      if (found?.id) { productMap.set(pid, found.id as string); continue; }
      const pname = pr.Product__r?.Name || "Salesforce Product";
      const { data: inserted, error } = await admin.from("master_products")
        .insert({
          product_name: pname,
          salesforce_id: pid,
          default_uom: pr.UOM__c || null,
          budgeted_rate: pr.Budget_Rate_Product_Requisition__c ?? null,
          product_description: pr.Product_Description__c,
          quality_instruction: pr.Quality_instruction__c,
          delivery_instruction: pr.Delivery_GRN_instruction__c,
          is_active: true,
          created_by: uid,
        })
        .select("id").single();
      if (error) throw new Error(`create product ${pname}: ${error.message}`);
      productMap.set(pid, inserted!.id as string);
    }
    step("products_resolved", { count: productMap.size });

    // ---- 6. Upsert procurement_orders row ----
    const orderStatus = mapStatus(sfReq.Requisition_Status__c);
    const requisitionName = sfReq.Requisition_name__c || sfReq.Name || "Salesforce Requisition";
    const paymentTerms = sfReq.Payment_Terms__c != null ? `Net ${Math.round(sfReq.Payment_Terms__c)}` : null;
    const orderDate = sfReq.Requisition_Raised_Date__c || sfReq.PO_Date__c || new Date().toISOString().slice(0, 10);

    // Collect all finalized vendors (all assigned in this org). Use first as legacy vendor_id.
    const allVendorIds = Array.from(vendorMap.values());
    const legacyVendorId = allVendorIds[0] || null;

    const orderPayload = {
      salesforce_id: sfReq.Id,
      requisition_name: requisitionName,
      order_date: orderDate,
      status: orderStatus,
      source_type: "vendor",
      payment_terms: paymentTerms,
      expected_delivery_date: sfReq.Delivery_Due_Date__c,
      estimated_budget: sfReq.Budget_Required_Requistion__c ?? null,
      bill_to_address_id: billToId,
      ship_to_address_id: shipToId,
      bill_to: sfReq.Billing_Location__r?.Name || null,
      ship_to: sfReq.Shipping_Location__r?.Name || null,
      vendor_id: legacyVendorId,
      vendor_ids: allVendorIds,
      created_by: uid,
    };

    const { data: existingOrder } = await admin.from("procurement_orders")
      .select("id").eq("salesforce_id", sfReq.Id).maybeSingle();

    let orderId: string;
    if (existingOrder?.id) {
      orderId = existingOrder.id as string;
      const { error } = await admin.from("procurement_orders").update(orderPayload).eq("id", orderId);
      if (error) throw new Error(`update order: ${error.message}`);
      step("order_updated", { id: orderId });
    } else {
      const { data: inserted, error } = await admin.from("procurement_orders")
        .insert(orderPayload).select("id, po_number, requisition_number").single();
      if (error) throw new Error(`insert order: ${error.message}`);
      orderId = inserted!.id as string;
      step("order_created", { id: orderId, po_number: inserted!.po_number, requisition_number: inserted!.requisition_number });
    }

    // ---- 7. Sync procurement_items (delete+recreate for idempotency) ----
    await admin.from("procurement_items").delete().eq("procurement_id", orderId);
    const itemIdByPrId = new Map<string, string>(); // SF PR Id → procurement_items.id
    const itemIdByProductId = new Map<string, string>(); // SF Product Id → item.id (fallback match key)
    for (const pr of prLines) {
      const productLocalId = pr.Product__c ? productMap.get(pr.Product__c) : null;
      const rate = pr.Budget_Rate_Product_Requisition__c ?? 0;
      const qty = pr.Quantity__c ?? 0;
      const { data: inserted, error } = await admin.from("procurement_items")
        .insert({
          procurement_id: orderId,
          product_id: productLocalId,
          rate,
          qty,
          amount: rate * qty,
          uom: pr.UOM__c || null,
          vendor_ids: allVendorIds,
          salesforce_id: pr.Id,
        }).select("id").single();
      if (error) throw new Error(`insert item ${pr.Name}: ${error.message}`);
      itemIdByPrId.set(pr.Id, inserted!.id as string);
      if (pr.Product__c) itemIdByProductId.set(pr.Product__c, inserted!.id as string);
    }
    step("items_created", { count: itemIdByPrId.size });

    // ---- 8. Sync vendor quotes ----
    // Delete existing quotes for this PO so re-imports don't stack
    await admin.from("procurement_vendor_quotes").delete().eq("po_id", orderId);

    // Group quote lines by vendor account id (Vendor_Name__c) or via Vendor_Assigned__c → Vendor__c
    const vaVendorMap = new Map<string, string>(); // Vendor_Assigned__c Id → SF Account Id
    for (const v of vas) if (v.Vendor__c) vaVendorMap.set(v.Id, v.Vendor__c);

    const quotesByVendor = new Map<string, SFQuoteLine[]>();
    for (const q of qlis) {
      const acc = q.Vendor_Name__c || (q.Vendor_Assigned__c ? vaVendorMap.get(q.Vendor_Assigned__c) : null);
      if (!acc) continue;
      if (!quotesByVendor.has(acc)) quotesByVendor.set(acc, []);
      quotesByVendor.get(acc)!.push(q);
    }

    let quoteCount = 0, quoteItemCount = 0;
    for (const [accId, lines] of quotesByVendor) {
      const vendorLocalId = vendorMap.get(accId);
      if (!vendorLocalId) continue;
      const va = vas.find((v) => v.Vendor__c === accId);
      const vendorPaymentTerm = va?.Vendors_payment_terms__c != null ? `Net ${Math.round(va.Vendors_payment_terms__c)}` : null;
      const { data: quote, error: qErr } = await admin.from("procurement_vendor_quotes")
        .insert({
          po_id: orderId,
          vendor_id: vendorLocalId,
          status: "Quote Submitted",
          vendor_payment_term: vendorPaymentTerm,
          submitted_at: new Date().toISOString(),
          first_submitted_at: new Date().toISOString(),
          created_by: uid,
          salesforce_id: va?.Id || null,
        }).select("id").single();
      if (qErr) throw new Error(`insert quote for vendor ${accId}: ${qErr.message}`);
      quoteCount++;

      for (const line of lines) {
        // Match to procurement_item: prefer Product_Requisition__c FK, then Product_Lookup__c → product-based item
        let itemId: string | undefined;
        if (line.Product_Requisition__c) itemId = itemIdByPrId.get(line.Product_Requisition__c);
        if (!itemId && line.Product_Lookup__c) itemId = itemIdByProductId.get(line.Product_Lookup__c);
        if (!itemId) continue;
        const rate = line.Rate_per_unit__c ?? 0;
        const discount = line.Discount__c ?? 0;
        const rateAfter = line.Rate_Per_Unit_After_Discount__c ?? rate;
        const { error: qiErr } = await admin.from("procurement_vendor_quote_items")
          .insert({
            quote_id: quote!.id,
            procurement_item_id: itemId,
            rate,
            discount_pct: discount,
            rate_after_discount: rateAfter,
            delivery_commitment_date: line.Vendor_Delivery_Commitment_Date__c,
            quality_notes: line.Quality_instruction__c,
            is_selected: true,
            salesforce_id: line.Id,
          });
        if (qiErr) throw new Error(`insert quote item ${line.Id}: ${qiErr.message}`);
        quoteItemCount++;
      }
    }
    step("quotes_created", { quotes: quoteCount, quote_items: quoteItemCount });

    // ---- 9. Sync Payment Schedules → invoices + payments ----
    // Payment_Schedule__c → Vendor_List__r (Vendor_Assigned__c) → Requistion__c
    const psRows = await sfQuery<SFPaymentSchedule>(
      `SELECT Id, Name, Status__c, Amount_Processed__c, Amount_To_Be_Paid__c, Invoice_Date_from_Vendor__c, Payment_Date__c, Payment_Due_Date__c, Payment_cheque_or_reference_number__c, Vendor_List__c FROM Payment_Schedule__c WHERE Vendor_List__r.Requistion__c = '${salesforceId}'`,
      SALESFORCE_API_KEY, LOVABLE_API_KEY,
    );
    step("payment_schedules_loaded", { count: psRows.length });

    let invoiceCount = 0, paymentCount = 0, psSkipped = 0;
    for (const ps of psRows) {
      const vaId = ps.Vendor_List__c;
      const accId = vaId ? vaVendorMap.get(vaId) : null;
      const vendorLocalId = accId ? vendorMap.get(accId) : null;
      if (!vendorLocalId) { psSkipped++; continue; }

      const amt = ps.Amount_To_Be_Paid__c ?? ps.Amount_Processed__c ?? 0;
      const invDate = ps.Invoice_Date_from_Vendor__c || ps.Payment_Due_Date__c || ps.Payment_Date__c || new Date().toISOString().slice(0, 10);

      // Upsert invoice by salesforce_id
      const { data: existingInv } = await admin.from("procurement_invoices")
        .select("id").eq("salesforce_id", ps.Id).maybeSingle();
      let invoiceId: string;
      const invPayload = {
        po_id: orderId,
        vendor_id: vendorLocalId,
        invoice_number: ps.Name || `PS-${ps.Id.slice(-6)}`,
        invoice_date: invDate,
        invoice_amount: amt,
        salesforce_id: ps.Id,
        created_by: uid,
      };
      if (existingInv?.id) {
        invoiceId = existingInv.id as string;
        await admin.from("procurement_invoices").update(invPayload).eq("id", invoiceId);
      } else {
        const { data: ins, error: iErr } = await admin.from("procurement_invoices")
          .insert(invPayload).select("id").single();
        if (iErr) throw new Error(`insert invoice ${ps.Name}: ${iErr.message}`);
        invoiceId = ins!.id as string;
        invoiceCount++;
      }

      // If paid, ensure a payment row
      const status = (ps.Status__c || "").toLowerCase();
      const paidAmt = ps.Amount_Processed__c ?? 0;
      if (status === "paid" && paidAmt > 0) {
        const paySfId = `${ps.Id}-pay`;
        const { data: existingPay } = await admin.from("procurement_invoice_payments")
          .select("id").eq("salesforce_id", paySfId).maybeSingle();
        const payPayload = {
          invoice_id: invoiceId,
          amount: paidAmt,
          payment_date: ps.Payment_Date__c || invDate,
          reference_number: ps.Payment_cheque_or_reference_number__c,
          salesforce_id: paySfId,
          created_by: uid,
          notes: "Imported from Salesforce Payment Schedule",
        };
        if (existingPay?.id) {
          await admin.from("procurement_invoice_payments").update(payPayload).eq("id", existingPay.id);
        } else {
          const { error: pErr } = await admin.from("procurement_invoice_payments").insert(payPayload);
          if (pErr) throw new Error(`insert payment for ${ps.Name}: ${pErr.message}`);
          paymentCount++;
        }
      }
    }
    step("invoices_and_payments", { invoices_created: invoiceCount, payments_created: paymentCount, skipped: psSkipped });

    report.order_id = orderId;
    report.success = true;
    return json(report, 200);
  } catch (e) {
    console.error("import-salesforce-procurement failed:", e);
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
