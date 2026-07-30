## Goal

Make vendor-quoted GST flow end-to-end, and make vendor selection/status come from the database instead of transient component state.

## What I verified in the code

- `procurement_vendor_quote_items` already has a `gst_percent` column and the vendor portal (`VendorQuote.tsx` + `submit-vendor-quote`) does save it.
- `ProcurementDetail.tsx`'s `VendorQuoteItemRow` interface (line ~99) has **no** `gst_percent` field, and neither `applyLineQuote` nor the auto-apply effect copies the vendor's GST onto the line — so `procurement_items.gst_percent` stays 0 and Vendor Comparison shows "No GST (0%)".
- `selectLineWinner` / `applyLineQuote` mutate only `rateLines` + `vendorAssignments` and toast "Save PO to persist" — nothing is written to the DB until the user clicks Save.
- The `useEffect` on `[order]` (line 306) rebuilds `rateLines` and `vendorAssignments` from the server on every parent refresh, so any unsaved selection is wiped → the "Selected" badge disappears and the "Select" button reappears (the flicker).

## Changes

### 1. GST flow-through
- Add `gst_percent` to the `VendorQuoteItemRow` interface so quoted GST is read from the already-selected `procurement_vendor_quote_items(*)`.
- In `applyLineQuote` and the single-quote auto-apply effect, set the line's `gst_percent` from the vendor's quote item and persist it alongside `rate`/`rate_source` on `procurement_items`.
- Vendor Comparison per-vendor rows: add GST %, Taxable, GST Amount, Line Total columns computed from the quote's own `gst_percent` (via the existing `lineGstBreakup` helper), so vendors are compared on GST-inclusive totals.
- Quote Details tab and the View Quote dialog totals: include GST % per line and add Total GST to the footer.
- PO generation and the PO PDF already read `procurement_items.gst_percent`; once step 1 persists it, both pick it up with no further change (verify against a generated PDF).

### 2. Persist vendor selection immediately
- Make `selectLineWinner` / `applyLineQuote` async and write to `procurement_items` in the same action: `rate`, `gst_percent`, `rate_source = 'quote'`, `rate_source_vendor_id`, `vendor_ids = [winner]`.
- Await the write, then call `onChanged()` so the refetched server row is what re-renders — the DB becomes the source of truth. Replace the "Save PO to persist" toast with a confirmation of the saved selection.
- Losing vendors' assignments for that line are removed in the same write, not just in local state.

### 3. Kill the flicker / races
- Guard the `[order]` re-init effect: skip rebuilding `rateLines`/`vendorAssignments` while a selection write is in flight (a ref-based "pending write" flag), so a mid-flight refresh cannot revert to stale server data.
- Make the auto-apply effect idempotent and one-shot per line: track already-applied line ids in a ref so re-renders/refreshes cannot re-trigger the write loop, and skip any line that already has `rate_source_vendor_id` persisted.
- Derive the vendor status badges (Quote Submitted / Selected / PO Issued) purely from the fetched `vendorQuotes` + `procurement_items` rows, not from any local "just clicked" state.

### Technical notes
- No schema migration needed: `gst_percent` exists on both `procurement_items` and `procurement_vendor_quote_items`.
- All edits are inside `src/components/procurement/ProcurementDetail.tsx`; `src/utils/purchaseOrderPdf.ts` is only touched if the PDF needs the vendor-quoted GST label.
- GRN, invoice, payment and stage-advance logic stay unchanged.
