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
  Billing_Location__r?: { Name?: string | null } | null;
  Shipping_Location__c: string | null;
  Shipping_Location__r?: { Name?: string | null } | null;
  CreatedDate: string | null;
  LastModifiedDate: string | null;
  CreatedBy?: { Name?: string | null } | null;
  LastModifiedBy?: { Name?: string | null } | null;
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
  CreatedDate: string | null;
  LastModifiedDate: string | null;
  CreatedBy?: { Name?: string | null } | null;
}
interface SFQuoteLine {
  Id: string;
  Vendor_Assigned__c: string | null;
  Vendor_Name__c: string | null;
  Product_Lookup__c: string | null;
  Product_Requisition__c: string | null;
  Quantity__c: number | null;
  UOM__c: string | null;
  Rate_per_unit__c: number | null;
  Discount__c: number | null;
  Rate_Per_Unit_After_Discount__c: number | null;
  Vendor_Delivery_Commitment_Date__c: string | null;
  Quality_instruction__c: string | null;
  CreatedDate: string | null;
  LastModifiedDate: string | null;
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
  Vendor_List__c: string | null;
  CreatedDate: string | null;
  LastModifiedDate: string | null;
  CreatedBy?: { Name?: string | null } | null;
}
interface SFContentDocLink {
  LinkedEntityId: string;
  ContentDocumentId: string;
  ContentDocument?: {
    Title?: string | null;
    FileExtension?: string | null;
    LatestPublishedVersionId?: string | null;
    CreatedDate?: string | null;
    FileType?: string | null;
    ContentSize?: number | null;
  } | null;
}

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

async function sfDownloadFile(versionId: string, apiKey: string, gatewayKey: string): Promise<Uint8Array> {
  const resp = await fetch(`${GATEWAY_URL}/sobjects/ContentVersion/${versionId}/VersionData`, {
    headers: { Authorization: `Bearer ${gatewayKey}`, "X-Connection-Api-Key": apiKey },
  });
  if (!resp.ok) throw new Error(`Salesforce file download failed [${resp.status}]`);
  return new Uint8Array(await resp.arrayBuffer());
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
      `SELECT Id, Name, Requisition_name__c, Requisition_Status__c, Requisition_Raised_Date__c, PO_Date__c, Delivery_Due_Date__c, Payment_Terms__c, Budget_Required_Requistion__c, Billing_Location__c, Billing_Location__r.Name, Shipping_Location__c, Shipping_Location__r.Name, CreatedDate, LastModifiedDate, CreatedBy.Name, LastModifiedBy.Name FROM Requistion__c WHERE Id = '${salesforceId}' LIMIT 1`,
      SALESFORCE_API_KEY, LOVABLE_API_KEY,
    );
    if (!reqRows.length) return json({ error: `Requisition ${salesforceId} not found in Salesforce` }, 404);
    const sfReq = reqRows[0];
    step("requisition_loaded", { name: sfReq.Name });

    const [prLines, vas, qlis] = await Promise.all([
      sfQuery<SFProductReq>(
        `SELECT Id, Name, Product__c, Product__r.Name, Quantity__c, UOM__c, Budget_Rate_Product_Requisition__c, Product_Description__c, Expected_Delivery_Date__c, Quality_instruction__c, Delivery_GRN_instruction__c FROM Product_Requisition__c WHERE Requistion__c = '${salesforceId}'`,
        SALESFORCE_API_KEY, LOVABLE_API_KEY,
      ),
      sfQuery<SFVendorAssigned>(
        `SELECT Id, Name, Vendor__c, Vendor__r.Name, Vendor__r.Phone, Vendors_payment_terms__c, Vendor_Email__c, Final_Decision__c, Vendor_Requisition_Status__c, CreatedDate, LastModifiedDate, CreatedBy.Name FROM Vendor_Assigned__c WHERE Requistion__c = '${salesforceId}'`,
        SALESFORCE_API_KEY, LOVABLE_API_KEY,
      ),
      sfQuery<SFQuoteLine>(
        `SELECT Id, Vendor_Assigned__c, Vendor_Name__c, Product_Lookup__c, Product_Requisition__c, Quantity__c, UOM__c, Rate_per_unit__c, Discount__c, Rate_Per_Unit_After_Discount__c, Vendor_Delivery_Commitment_Date__c, Quality_instruction__c, CreatedDate, LastModifiedDate FROM Vendor_Quote_Line_Item__c WHERE Requisition__c = '${salesforceId}'`,
        SALESFORCE_API_KEY, LOVABLE_API_KEY,
      ),
    ]);
    step("children_loaded", { product_reqs: prLines.length, vendors_assigned: vas.length, quote_lines: qlis.length });

    // ---- Addresses ----
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

    // ---- Vendors ----
    const vendorMap = new Map<string, string>();
    const vendorNameMap = new Map<string, string>(); // local vendor id → display name
    for (const v of vas) {
      const accId = v.Vendor__c;
      if (!accId || vendorMap.has(accId)) continue;
      const { data: found } = await admin.from("vendors").select("id, name").eq("salesforce_id", accId).maybeSingle();
      if (found?.id) { vendorMap.set(accId, found.id as string); vendorNameMap.set(found.id as string, (found as any).name); continue; }
      const name = v.Vendor__r?.Name || v.Name || "Salesforce Vendor";
      const { data: byName } = await admin.from("vendors").select("id, name").ilike("name", name).limit(1).maybeSingle();
      if (byName?.id) {
        await admin.from("vendors").update({ salesforce_id: accId }).eq("id", byName.id);
        vendorMap.set(accId, byName.id as string); vendorNameMap.set(byName.id as string, (byName as any).name);
        continue;
      }
      const email = v.Vendor_Email__c ? [v.Vendor_Email__c] : [];
      const phone = v.Vendor__r?.Phone ? [v.Vendor__r.Phone] : [];
      const { data: inserted, error } = await admin.from("vendors")
        .insert({ name, salesforce_id: accId, created_by: uid, status: "active", phone, email })
        .select("id, name").single();
      if (error) throw new Error(`create vendor ${name}: ${error.message}`);
      vendorMap.set(accId, inserted!.id as string); vendorNameMap.set(inserted!.id as string, (inserted as any).name);
    }

    // ---- Products ----
    const productMap = new Map<string, string>();
    for (const pr of prLines) {
      const pid = pr.Product__c;
      if (!pid || productMap.has(pid)) continue;
      const { data: found } = await admin.from("master_products").select("id").eq("salesforce_id", pid).maybeSingle();
      if (found?.id) { productMap.set(pid, found.id as string); continue; }
      const pname = pr.Product__r?.Name || "Salesforce Product";
      const { data: inserted, error } = await admin.from("master_products")
        .insert({
          product_name: pname, salesforce_id: pid,
          default_uom: pr.UOM__c || null,
          budgeted_rate: pr.Budget_Rate_Product_Requisition__c ?? null,
          product_description: pr.Product_Description__c,
          quality_instruction: pr.Quality_instruction__c,
          delivery_instruction: pr.Delivery_GRN_instruction__c,
          is_active: true, created_by: uid,
        }).select("id").single();
      if (error) throw new Error(`create product ${pname}: ${error.message}`);
      productMap.set(pid, inserted!.id as string);
    }

    const allVendorIds = Array.from(vendorMap.values());
    const legacyVendorId = allVendorIds[0] || null;
    const orderDate = sfReq.Requisition_Raised_Date__c || (sfReq.CreatedDate ? sfReq.CreatedDate.slice(0, 10) : null) || sfReq.PO_Date__c || new Date().toISOString().slice(0, 10);
    const requisitionName = sfReq.Requisition_name__c || sfReq.Name || "Salesforce Requisition";
    const paymentTerms = sfReq.Payment_Terms__c != null ? `Net ${Math.round(sfReq.Payment_Terms__c)}` : null;

    // ---- 9. Load Payment Schedules early (needed for status aggregation) ----
    const psRows = await sfQuery<SFPaymentSchedule>(
      `SELECT Id, Name, Status__c, Amount_Processed__c, Amount_To_Be_Paid__c, Invoice_Date_from_Vendor__c, Payment_Date__c, Payment_Due_Date__c, Payment_cheque_or_reference_number__c, Vendor_List__c, CreatedDate, LastModifiedDate, CreatedBy.Name FROM Payment_Schedule__c WHERE Vendor_List__r.Requistion__c = '${salesforceId}'`,
      SALESFORCE_API_KEY, LOVABLE_API_KEY,
    );

    // ---- Compute final aggregated PO status from vendor lifecycle ----
    // Rank: Requisition 0 → Approved 1 → Quote Requested 2 → Quote Received 3 → PO Issued 4 → Goods Received 5 → Invoice Received 6 → Paid 7
    const vaVendorMap = new Map<string, string>();
    for (const v of vas) if (v.Vendor__c) vaVendorMap.set(v.Id, v.Vendor__c);
    const psByVendor = new Map<string, SFPaymentSchedule[]>();
    for (const ps of psRows) {
      const acc = ps.Vendor_List__c ? vaVendorMap.get(ps.Vendor_List__c) : null;
      if (!acc) continue;
      if (!psByVendor.has(acc)) psByVendor.set(acc, []);
      psByVendor.get(acc)!.push(ps);
    }
    const quotesByVendorAcc = new Map<string, SFQuoteLine[]>();
    for (const q of qlis) {
      const acc = q.Vendor_Name__c || (q.Vendor_Assigned__c ? vaVendorMap.get(q.Vendor_Assigned__c) : null);
      if (!acc) continue;
      if (!quotesByVendorAcc.has(acc)) quotesByVendorAcc.set(acc, []);
      quotesByVendorAcc.get(acc)!.push(q);
    }

    let finalRank = 0;
    const baseFromSF = mapStatus(sfReq.Requisition_Status__c);
    const baseRankMap: Record<string, number> = {
      "Requisition": 0, "Requisition Approved": 1, "Quote Requested": 2,
      "Quote Received": 3, "PO Issued": 4, "Goods Received": 5,
      "Invoice Received": 6, "Paid": 7,
    };
    finalRank = baseRankMap[baseFromSF] ?? 0;

    // Bump rank based on invoice/payment presence
    if (psRows.length > 0) {
      const allPaid = psRows.every((p) => (p.Status__c || "").toLowerCase() === "paid");
      const anyInvoice = psRows.some((p) => !!p.Invoice_Date_from_Vendor__c || (p.Amount_Processed__c ?? 0) > 0 || (p.Amount_To_Be_Paid__c ?? 0) > 0);
      if (allPaid) finalRank = Math.max(finalRank, 7);
      else if (anyInvoice) finalRank = Math.max(finalRank, 6);
    }

    const rankToStatus = ["Requisition", "Requisition Approved", "Quote Requested", "Quote Received", "PO Issued", "Goods Received", "Invoice Received", "Paid"];
    const orderStatus = rankToStatus[finalRank];

    // ---- Build stage_history from SF timestamps ----
    const stageHistory: Array<Record<string, unknown>> = [];
    const pushStage = (status: string, at: string | null, actor: string | null, note: string) => {
      if (!at) at = new Date().toISOString();
      stageHistory.push({ status, moved_by: null, moved_by_name: actor || "Salesforce", moved_at: at, note, auto: true });
    };
    const sfActorRaised = sfReq.CreatedBy?.Name || null;
    const sfActorApproved = sfReq.LastModifiedBy?.Name || sfActorRaised;

    pushStage("Requisition", sfReq.CreatedDate, sfActorRaised, "Imported from Salesforce");
    if (finalRank >= 1) pushStage("Requisition Approved", sfReq.LastModifiedDate, sfActorApproved, "Imported from Salesforce");
    if (finalRank >= 2) {
      const earliestVA = vas.slice().sort((a, b) => (a.CreatedDate || "").localeCompare(b.CreatedDate || ""))[0];
      pushStage("Quote Requested", earliestVA?.CreatedDate ?? null, earliestVA?.CreatedBy?.Name ?? sfActorRaised, `Vendor(s) assigned in Salesforce`);
    }
    if (finalRank >= 3) {
      const earliestQ = qlis.slice().sort((a, b) => (a.CreatedDate || "").localeCompare(b.CreatedDate || ""))[0];
      pushStage("Quote Received", earliestQ?.CreatedDate ?? null, sfActorRaised, "Vendor quote submitted in Salesforce");
    }
    if (finalRank >= 4) pushStage("PO Issued", sfReq.PO_Date__c || sfReq.LastModifiedDate, sfActorApproved, "PO issued in Salesforce");
    if (finalRank >= 6) {
      const earliestInv = psRows.slice().sort((a, b) => (a.Invoice_Date_from_Vendor__c || a.CreatedDate || "").localeCompare(b.Invoice_Date_from_Vendor__c || b.CreatedDate || ""))[0];
      pushStage("Invoice Received", earliestInv?.Invoice_Date_from_Vendor__c || earliestInv?.CreatedDate || null, earliestInv?.CreatedBy?.Name || sfActorRaised, "Invoice recorded in Salesforce");
    }
    if (finalRank >= 7) {
      const latestPay = psRows.slice().sort((a, b) => (b.Payment_Date__c || "").localeCompare(a.Payment_Date__c || ""))[0];
      pushStage("Paid", latestPay?.Payment_Date__c || null, latestPay?.CreatedBy?.Name || sfActorRaised, "Payment recorded in Salesforce");
    }

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
      stage_history: stageHistory,
      created_by: uid,
    };

    const { data: existingOrder } = await admin.from("procurement_orders")
      .select("id").eq("salesforce_id", sfReq.Id).maybeSingle();

    let orderId: string;
    if (existingOrder?.id) {
      orderId = existingOrder.id as string;
      const { error } = await admin.from("procurement_orders").update(orderPayload).eq("id", orderId);
      if (error) throw new Error(`update order: ${error.message}`);
      step("order_updated", { id: orderId, status: orderStatus });
    } else {
      const { data: inserted, error } = await admin.from("procurement_orders")
        .insert(orderPayload).select("id, po_number, requisition_number").single();
      if (error) throw new Error(`insert order: ${error.message}`);
      orderId = inserted!.id as string;
      step("order_created", { id: orderId, po_number: inserted!.po_number, requisition_number: inserted!.requisition_number, status: orderStatus });
    }

    // ---- Items ----
    await admin.from("procurement_items").delete().eq("procurement_id", orderId);
    const itemIdByPrId = new Map<string, string>();
    const itemIdByProductId = new Map<string, string>();
    for (const pr of prLines) {
      const productLocalId = pr.Product__c ? productMap.get(pr.Product__c) : null;
      const rate = pr.Budget_Rate_Product_Requisition__c ?? 0;
      const qty = pr.Quantity__c ?? 0;
      const { data: inserted, error } = await admin.from("procurement_items")
        .insert({
          procurement_id: orderId, product_id: productLocalId,
          rate, qty, amount: rate * qty, uom: pr.UOM__c || null,
          vendor_ids: allVendorIds, salesforce_id: pr.Id,
        }).select("id").single();
      if (error) throw new Error(`insert item ${pr.Name}: ${error.message}`);
      itemIdByPrId.set(pr.Id, inserted!.id as string);
      if (pr.Product__c) itemIdByProductId.set(pr.Product__c, inserted!.id as string);
    }

    // ---- Quotes ----
    await admin.from("procurement_vendor_quotes").delete().eq("po_id", orderId);
    let quoteCount = 0, quoteItemCount = 0;
    for (const [accId, lines] of quotesByVendorAcc) {
      const vendorLocalId = vendorMap.get(accId);
      if (!vendorLocalId) continue;
      const va = vas.find((v) => v.Vendor__c === accId);
      const vendorPaymentTerm = va?.Vendors_payment_terms__c != null ? `Net ${Math.round(va.Vendors_payment_terms__c)}` : null;
      // Use SF timestamp for submitted_at
      const earliestLine = lines.slice().sort((a, b) => (a.CreatedDate || "").localeCompare(b.CreatedDate || ""))[0];
      const submittedAt = earliestLine?.CreatedDate || va?.LastModifiedDate || va?.CreatedDate || new Date().toISOString();
      const { data: quote, error: qErr } = await admin.from("procurement_vendor_quotes")
        .insert({
          po_id: orderId, vendor_id: vendorLocalId, status: "submitted",
          vendor_payment_term: vendorPaymentTerm,
          submitted_at: submittedAt, first_submitted_at: submittedAt,
          created_by: uid, salesforce_id: va?.Id || null,
        }).select("id").single();
      if (qErr) throw new Error(`insert quote for vendor ${accId}: ${qErr.message}`);
      quoteCount++;

      for (const line of lines) {
        let itemId: string | undefined;
        if (line.Product_Requisition__c) itemId = itemIdByPrId.get(line.Product_Requisition__c);
        if (!itemId && line.Product_Lookup__c) itemId = itemIdByProductId.get(line.Product_Lookup__c);
        if (!itemId) continue;
        const rate = line.Rate_per_unit__c ?? 0;
        const discount = line.Discount__c ?? 0;
        const rateAfter = line.Rate_Per_Unit_After_Discount__c ?? rate;
        const { error: qiErr } = await admin.from("procurement_vendor_quote_items")
          .insert({
            quote_id: quote!.id, procurement_item_id: itemId,
            rate, discount_pct: discount, rate_after_discount: rateAfter,
            delivery_commitment_date: line.Vendor_Delivery_Commitment_Date__c,
            quality_notes: line.Quality_instruction__c,
            is_selected: true, salesforce_id: line.Id,
          });
        if (qiErr) throw new Error(`insert quote item ${line.Id}: ${qiErr.message}`);
        quoteItemCount++;

        // Populate the line item's own rate/amount and mark this vendor as the source
        // so the top-line "Rate" / "Amount" cells render (single-vendor imports).
        const { data: itemRow } = await admin.from("procurement_items")
          .select("qty").eq("id", itemId).single();
        const qty = Number(itemRow?.qty || 0);
        await admin.from("procurement_items").update({
          rate: rateAfter,
          amount: rateAfter * qty,
          rate_source: "quote",
          rate_source_vendor_id: vendorLocalId,
        }).eq("id", itemId);
      }
    }
    step("quotes_created", { quotes: quoteCount, quote_items: quoteItemCount });

    // ---- Invoices + Payments ----
    let invoiceCount = 0, paymentCount = 0, psSkipped = 0;
    const invoiceIdBySfPsId = new Map<string, string>(); // Payment_Schedule__c Id → invoice.id
    for (const ps of psRows) {
      const vaId = ps.Vendor_List__c;
      const accId = vaId ? vaVendorMap.get(vaId) : null;
      const vendorLocalId = accId ? vendorMap.get(accId) : null;
      if (!vendorLocalId) { psSkipped++; continue; }

      const amt = ps.Amount_To_Be_Paid__c ?? ps.Amount_Processed__c ?? 0;
      const invDate = ps.Invoice_Date_from_Vendor__c || (ps.CreatedDate ? ps.CreatedDate.slice(0, 10) : null) || ps.Payment_Due_Date__c || ps.Payment_Date__c || new Date().toISOString().slice(0, 10);

      const { data: existingInv } = await admin.from("procurement_invoices")
        .select("id").eq("salesforce_id", ps.Id).maybeSingle();
      let invoiceId: string;
      const invPayload = {
        po_id: orderId, vendor_id: vendorLocalId,
        invoice_number: ps.Name || `PS-${ps.Id.slice(-6)}`,
        invoice_date: invDate, invoice_amount: amt,
        salesforce_id: ps.Id, created_by: uid,
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
      invoiceIdBySfPsId.set(ps.Id, invoiceId);

      const status = (ps.Status__c || "").toLowerCase();
      const paidAmt = ps.Amount_Processed__c ?? 0;
      if (status === "paid" && paidAmt > 0) {
        const paySfId = `${ps.Id}-pay`;
        const { data: existingPay } = await admin.from("procurement_invoice_payments")
          .select("id").eq("salesforce_id", paySfId).maybeSingle();
        const payPayload = {
          invoice_id: invoiceId, amount: paidAmt,
          payment_date: ps.Payment_Date__c || invDate,
          reference_number: ps.Payment_cheque_or_reference_number__c,
          salesforce_id: paySfId, created_by: uid,
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

    // ---- Invoice file attachments (ContentDocumentLink → ContentVersion) ----
    let attachmentCount = 0, attachmentsSkipped = 0;
    const psIds = Array.from(invoiceIdBySfPsId.keys());
    if (psIds.length > 0) {
      const idListSoql = psIds.map((id) => `'${id}'`).join(",");
      const cdls = await sfQuery<SFContentDocLink>(
        `SELECT LinkedEntityId, ContentDocumentId, ContentDocument.Title, ContentDocument.FileExtension, ContentDocument.LatestPublishedVersionId, ContentDocument.CreatedDate, ContentDocument.ContentSize FROM ContentDocumentLink WHERE LinkedEntityId IN (${idListSoql})`,
        SALESFORCE_API_KEY, LOVABLE_API_KEY,
      );
      step("sf_invoice_attachments_found", { count: cdls.length });
      for (const link of cdls) {
        try {
          const invoiceId = invoiceIdBySfPsId.get(link.LinkedEntityId);
          const versionId = link.ContentDocument?.LatestPublishedVersionId;
          if (!invoiceId || !versionId) { attachmentsSkipped++; continue; }
          const title = link.ContentDocument?.Title || "attachment";
          const ext = link.ContentDocument?.FileExtension || "bin";
          const fileName = `${title}.${ext}`;
          const sfAttSalesforceId = `${link.LinkedEntityId}-${link.ContentDocumentId}`;
          const { data: existing } = await admin.from("procurement_invoice_attachments")
            .select("id").eq("salesforce_id", sfAttSalesforceId).maybeSingle();
          if (existing?.id) { attachmentsSkipped++; continue; }
          const bytes = await sfDownloadFile(versionId, SALESFORCE_API_KEY, LOVABLE_API_KEY);
          const storagePath = `${uid}/sf-${link.ContentDocumentId}-${Date.now()}.${ext}`;
          const { error: upErr } = await admin.storage.from("invoice-attachments")
            .upload(storagePath, bytes, { contentType: `application/${ext}`, upsert: false });
          if (upErr) throw new Error(`storage upload ${fileName}: ${upErr.message}`);
          const { error: attErr } = await admin.from("procurement_invoice_attachments").insert({
            invoice_id: invoiceId, file_name: fileName, file_path: storagePath,
            file_size: link.ContentDocument?.ContentSize ?? bytes.byteLength,
            created_by: uid, salesforce_id: sfAttSalesforceId,
          });
          if (attErr) throw new Error(`insert attachment row ${fileName}: ${attErr.message}`);
          attachmentCount++;
        } catch (e) {
          console.error("attachment import error:", e);
          attachmentsSkipped++;
        }
      }
    }
    step("invoice_attachments", { imported: attachmentCount, skipped: attachmentsSkipped });

    // ---- PO-level + Vendor-level attachments (Requistion__c + Vendor_Assigned__c) ----
    let poAttCount = 0, poAttSkipped = 0;
    const reqEntityIds: string[] = [salesforceId];
    const vaIdToVendorLocal = new Map<string, string>();
    for (const v of vas) {
      reqEntityIds.push(v.Id);
      const accId = v.Vendor__c;
      const local = accId ? vendorMap.get(accId) : null;
      if (local) vaIdToVendorLocal.set(v.Id, local);
    }
    try {
      const idListSoql = reqEntityIds.map((id) => `'${id}'`).join(",");
      const cdls2 = await sfQuery<SFContentDocLink>(
        `SELECT LinkedEntityId, ContentDocumentId, ContentDocument.Title, ContentDocument.FileExtension, ContentDocument.LatestPublishedVersionId, ContentDocument.CreatedDate, ContentDocument.ContentSize FROM ContentDocumentLink WHERE LinkedEntityId IN (${idListSoql})`,
        SALESFORCE_API_KEY, LOVABLE_API_KEY,
      );
      step("sf_po_attachments_found", { count: cdls2.length });
      for (const link of cdls2) {
        try {
          const versionId = link.ContentDocument?.LatestPublishedVersionId;
          if (!versionId) { poAttSkipped++; continue; }
          const title = link.ContentDocument?.Title || "attachment";
          const ext = link.ContentDocument?.FileExtension || "bin";
          const fileName = `${title}.${ext}`;
          const sfAttId = `${link.LinkedEntityId}-${link.ContentDocumentId}`;
          const { data: existing } = await admin.from("procurement_attachments")
            .select("id").eq("salesforce_id", sfAttId).maybeSingle();
          if (existing?.id) { poAttSkipped++; continue; }
          const isVendor = vaIdToVendorLocal.has(link.LinkedEntityId);
          const vendorLocalId = isVendor ? vaIdToVendorLocal.get(link.LinkedEntityId)! : null;
          const bytes = await sfDownloadFile(versionId, SALESFORCE_API_KEY, LOVABLE_API_KEY);
          const storagePath = `${uid}/sf-${link.ContentDocumentId}-${Date.now()}.${ext}`;
          const { error: upErr } = await admin.storage.from("procurement-attachments")
            .upload(storagePath, bytes, { contentType: `application/${ext}`, upsert: false });
          if (upErr) throw new Error(`storage upload ${fileName}: ${upErr.message}`);
          const { error: attErr } = await admin.from("procurement_attachments").insert({
            po_id: orderId, vendor_id: vendorLocalId,
            scope: isVendor ? "vendor" : "requisition",
            file_name: fileName, file_path: storagePath,
            file_size: link.ContentDocument?.ContentSize ?? bytes.byteLength,
            source: "salesforce", salesforce_id: sfAttId, created_by: uid,
          });
          if (attErr) throw new Error(`insert po attachment row ${fileName}: ${attErr.message}`);
          poAttCount++;
        } catch (e) {
          console.error("po attachment error:", e);
          poAttSkipped++;
        }
      }
    } catch (e) {
      console.error("po attachments query failed:", e);
    }
    step("po_attachments", { imported: poAttCount, skipped: poAttSkipped });

    report.order_id = orderId;
    report.status = orderStatus;
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
