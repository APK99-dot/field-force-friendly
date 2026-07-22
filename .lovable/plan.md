
## Goal

Validate the Salesforce → Lovable procurement mapping by importing **one complete Requisition** (with its line items, assigned vendors, quotes, PO details, and any payment schedule) end-to-end, and rendering it in the existing Procurement UI unchanged. No UI redesign; only new backend + admin action to trigger the import.

## Salesforce objects (verified via connector)

The connected org exposes these custom objects for the procurement flow:

- `Requistion__c` — parent requisition (Name, `Requisition_name__c`, `Requisition_Status__c`, `Requisition_Raised_Date__c`, `PO_Date__c`, `Delivery_Due_Date__c`, `Payment_Terms__c` (days), `Billing_Location__c` → Account, `Shipping_Location__c` → Account, `Vendor__c` → Account, `Budget_Required_Requistion__c`)
- `Product_Requisition__c` — requisition line items (child of Requistion__c)
- `Vendor_Assigned__c` — vendors assigned to a requisition
- `Vendor_Quote_Line_Item__c` — per-vendor, per-line quoted rates
- `Vendor_Document__c` — vendor attachments (metadata only, files stay in SF)
- `Payment_Schedule__c` — payment plan
- Standard `SalesforceInvoice` — invoices

There is **no** dedicated `GRN__c` / Goods Receipt object in this org. GRNs will be seeded as empty in Lovable and marked as "no source in SF".

## Target requisition for POC

Default pick: **"Rmx Concrete India - June & July 2026"** (`a01fu00000jFWGzAAO`) — has 3 line items, 1 assigned vendor, 3 quote line items, PO date + payment terms populated. Nice representative record. (If you prefer a different one — e.g. "Stone Requirement - June 2026" which has 4 lines / 4 quotes — say so before I run and I'll swap the ID.)

## Field mapping (SF → Lovable `procurement_orders` + children)

```text
Requistion__c                         → procurement_orders
  Id                                  → salesforce_id (new column)
  Name / Requisition_name__c          → requisition_name
  Requisition_Raised_Date__c          → created_at (date part)
  PO_Date__c                          → po_date (existing) / stays as is
  Delivery_Due_Date__c                → expected_delivery_date
  Payment_Terms__c (Integer days)     → payment_terms ("Net N")
  Billing_Location__r.Name            → bill_to_id (lookup/create in master_addresses)
  Shipping_Location__r.Name           → ship_to_id (lookup/create in master_addresses)
  Requisition_Status__c               → status (mapped: Initiated→Requisition,
                                        Approved→Requisition Approved,
                                        Vendor list identified→Quote Requested,
                                        Vendor shortlisted→PO Issued)
  Budget_Required_Requistion__c       → budget_amount (if column exists, else ignored)
  source_type                         → "vendor" (hardcoded)

Product_Requisition__c                → procurement_items
  Product name/lookup                 → product_id (match on master_products.salesforce_id
                                        or product name; auto-create if missing)
  Quantity / UOM / Rate / Description → qty, uom, rate, description
  Vendor_Assigned relations           → vendor_ids[]

Vendor_Assigned__c                    → contributes vendor into procurement_items.vendor_ids
  Vendor Account                      → vendors (match on salesforce_id, else auto-create
                                        via existing vendor import path)

Vendor_Quote_Line_Item__c             → procurement_vendor_quotes
                                      + procurement_vendor_quote_items
  Vendor + Line + Rate + Qty          → one quote per vendor with items
  status                              → "Quote Submitted" if a rate exists, else "Draft"

Payment_Schedule__c (if present)      → procurement_invoice_payments
                                        (informational only — no invoice linkage
                                         unless SalesforceInvoice records exist for the req)

SalesforceInvoice (if any)            → procurement_invoices + procurement_invoice_items
                                        (skip if org has none for this req)

GRN                                   → none in SF; leave GRN section empty in the imported PO
```

## Deliverables

1. **New edge function** `supabase/functions/import-salesforce-procurement/index.ts`
   - Verifies caller is an authenticated admin (same pattern as `import-salesforce-products`).
   - Accepts `{ salesforce_id: string }` in the POST body — one requisition per call.
   - Uses the Salesforce connector gateway (`LOVABLE_API_KEY` + `SALESFORCE_API_KEY`, already configured).
   - Fetches Requistion__c + child Product_Requisition__r, Vendor_Assigned__r, Vendor_Quote_Line_Items__r in a single SOQL sub-query call, then follow-up queries for Payment_Schedule__c and any SalesforceInvoice tied to the requisition (best-effort — skip cleanly if none).
   - Resolves/creates dependent records (vendors, master_products, master_addresses) using existing tables — reuses `salesforce_id` de-duplication like the product importer.
   - Upserts the `procurement_orders` row (by `salesforce_id`), then its `procurement_items`, `procurement_vendor_quotes`, `procurement_vendor_quote_items`, and optional invoices/payments.
   - Returns a JSON report: what was created vs updated per table, plus any skipped items with reasons.

2. **Schema migration**
   - Add `salesforce_id TEXT UNIQUE` to `procurement_orders`, `procurement_items`, `procurement_vendor_quotes`, `procurement_vendor_quote_items`, and `master_addresses` (mirroring the existing pattern on `master_products` and `vendors`) so the importer is idempotent and safe to re-run.
   - Add `deploy` block in `supabase/config.toml` if needed (verify_jwt default is fine).

3. **Admin trigger UI (minimal — no design change)**
   - Add a small "Import from Salesforce" button on the Procurement list page (`src/pages/Procurement.tsx`), visible to admins only.
   - Opens a plain dialog with a single input: **Salesforce Requisition ID** (prefilled with the POC ID above), plus an "Import" button.
   - Calls the edge function, shows a toast with the import report, then refreshes the list. No changes to the PO detail UI — the imported record should render inside the existing screens as-is.

## Verification

After running, open the imported PO in the existing Procurement detail view and confirm:
- Header shows requisition name, dates, bill-to / ship-to, payment terms.
- Line items list matches SF (product, qty, UOM, rate).
- Assigned vendor(s) render, with the quote table populated from the SF quote line items.
- Status maps to the correct stage in the header stepper.
- GRNs and Invoices sections stay empty (expected — no source data), and Record Payment / Add Invoice actions still work if the user clicks them.

## Out of scope for this POC

- Bulk import UI and background job (comes in the next phase).
- Vendor Documents file transfer (only metadata, if any, will be logged in the report).
- Two-way sync back to Salesforce.
- Any change to the existing Procurement UI.
