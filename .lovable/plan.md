
## Goal

Bulk-import **every Salesforce `Requistion__c` record from June 2026** into the Lovable procurement module, with complete child data (line items, assigned vendors, quote line items, payment schedules / invoices, and all file attachments). Nothing may be dropped silently. All timestamps and dates from Salesforce must be preserved exactly — no field should ever be stamped with the current server time or the current admin's name.

## Approach

Reuse the existing `import-salesforce-procurement` edge function (already proven for single-record imports of `REQ-0015` and `REQ-0016`) and drive it from a new bulk orchestrator, so the mapping logic stays in one place.

### 1. New edge function: `bulk-import-salesforce-procurement`

- Admin-only (same auth pattern as the single import).
- Accepts `{ from: "2026-06-01", to: "2026-06-30" }` (defaults to June 2026 if omitted).
- Runs a single SOQL query to list candidate Ids:
  ```
  SELECT Id, Name, Requisition_Raised_Date__c
  FROM Requistion__c
  WHERE Requisition_Raised_Date__c >= 2026-06-01
    AND Requisition_Raised_Date__c <= 2026-06-30
  ORDER BY Requisition_Raised_Date__c ASC
  ```
- For each Id, invokes the existing single-record import routine **in-process** (not via HTTP) so we reuse the mapper without extra auth hops.
- Processes sequentially with a small delay to stay under Salesforce API limits; collects a per-record report `{ salesforce_id, requisition_number, status: created|updated|failed, error?, counts }`.
- Returns an aggregated JSON summary and also writes each per-record report to the response so the UI can render a full audit list.

### 2. Harden the existing single-record importer

Refactor `supabase/functions/import-salesforce-procurement/index.ts` so its core logic is an exported `importRequisition(sfId)` function reused by the bulk orchestrator. While refactoring, close the gaps observed in the two POC imports:

- **Attachments (critical):** for every `Requistion__c`, `Vendor_Quote_Line_Item__c`, `Payment_Schedule__c`, and `Vendor_Document__c`, fetch related `ContentDocumentLink` → `ContentVersion` and upload the binary via the Salesforce REST `/sobjects/ContentVersion/{id}/VersionData` endpoint. Store PO/vendor-quote/vendor docs in the appropriate existing bucket (`vendor-quote-attachments`, new `procurement-attachments` if none fits) and invoice files in `invoice-attachments`. Dedupe on the existing `salesforce_id` column on `procurement_invoice_attachments`; add matching `salesforce_id` columns to any other attachment tables that need them.
- **Timestamp fidelity:** every insert/update must set `created_at`, `updated_at`, `submitted_at`, `paid_at`, `invoice_date`, `stage_history[*].moved_at`, etc. from Salesforce (`CreatedDate`, `LastModifiedDate`, field-specific dates). Never let a DB default or the current user overwrite them. Stage history actor stays `Salesforce` when no SF owner is present (already fixed for stages, extend to invoices/payments).
- **Zero data loss:** for every SF field the current mapper does not map, log it in the per-record report under `unmapped_fields` instead of dropping silently, so we can decide whether to extend the schema.

### 3. Schema migration

- Add `salesforce_id TEXT UNIQUE` on any attachment/child table that still lacks it (verify `procurement_invoice_attachments`, `procurement_invoice_payments`, `procurement_vendor_quote_items`, `procurement_items`).
- Add a small `procurement_import_runs` table to record each bulk run (started_at, finished_at, requested_range, summary jsonb) for auditability. GRANTs + RLS admin-only.

### 4. Admin UI

Extend `src/components/procurement/SalesforceImportDialog.tsx` (or add a sibling `SalesforceBulkImportDialog.tsx`) with a second tab **"Bulk import by date range"**:

- Date range inputs, prefilled 1 Jun 2026 – 30 Jun 2026.
- "Start Import" button calls `bulk-import-salesforce-procurement`.
- Streams / displays a progress list: `Requistion Id — Requisition # — status — counts`.
- Toast summarising totals (`X created, Y updated, Z failed`).
- Failed rows show error text and remain in the list; user can retry a single Id via the existing single-import path.

Trigger button lives on `src/pages/Procurement.tsx` (admin-only), next to the current "Import from Salesforce" action.

## Verification

After the bulk run:
1. Query Salesforce for the June count of `Requistion__c` records and confirm the Lovable count matches (by `salesforce_id`).
2. Spot-check 3 imported POs in the existing Procurement detail UI:
   - Header dates equal SF `Requisition_Raised_Date__c` / `PO_Date__c`.
   - Stage history actors and timestamps come from SF (no "Suyog", no current-day times).
   - Vendor Comparison shows rates + amounts; finalized vendors match SF `Vendor_Assigned__c`.
   - Invoices open and their attached PDFs/images download from `invoice-attachments`.
3. Confirm the run report lists zero silent skips — every unmapped field is called out.

## Out of scope

- Two-way sync back to Salesforce.
- Historical months other than June 2026 (same tool can be reused later once June is validated).
- Any UI redesign of the Procurement detail screen.
