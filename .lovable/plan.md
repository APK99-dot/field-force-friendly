# Per-Line-Item Vendors, Rates & Quotes

Move vendor assignment, quoting, and rate sourcing from the whole PO down to each line item, so different products in one requisition can come from different vendors. The top "Vendor(s)" field becomes an automatic read-only summary.

## What changes for the user

**Line items (in the PO/Requisition detail view)**
- Each line item row gains a **Vendor(s)** multi-select (same popover checkbox picker used at the top today), scoped to that row only.
- **Rate** stays editable per line (never locked), **Amount** stays Qty × Rate.
- A small **rate-source tag** appears next to the Rate:
  - Selecting a vendor from that line's quote comparison auto-fills the Rate and shows `From [Vendor]'s quote`.
  - Manually editing that number afterward switches the tag to `Manually adjusted`.
  - Typing a rate without ever picking a quote shows no tag (plain manual entry).

**Top "Vendor(s)" field**
- No longer selectable. It becomes a read-only line listing the distinct vendors used across all line items (e.g. "Abhaya Enterprises, ABC Electricals"), derived automatically from the per-line vendor assignments.

**Quote request / comparison — now per line item**
- "Download Quote Request", "Share via WhatsApp", quote-link generation, and the submitted-quote comparison table all operate per line item.
- A vendor invited on Line 1 only sees and quotes Line 1.
- You can still invite in bulk: select multiple line items + multiple vendors in one action; each resulting quote is tracked and compared per line item (not merged into one PO total).
- Each line's comparison table lists vendors who quoted that item, with an **Apply** action that fills that line's Rate and sets the "From [Vendor]'s quote" tag.

**Totals**
- Grand Total and Budget vs Actual keep summing each line's Amount, unchanged in behaviour.

## Technical section

### Database (migration)
1. `procurement_items`: add
   - `vendor_ids uuid[]` — vendors assigned to this line.
   - `rate_source text` — `null` (manual), `'quote'` (from a submitted quote), or `'quote_adjusted'` (was from a quote, then edited).
   - `rate_source_vendor_id uuid` — vendor whose quote produced the rate (for the tag label).
2. `procurement_vendor_quotes`: add
   - `procurement_item_ids uuid[]` — the specific line items this vendor was invited to quote. Existing rows (PO-wide) can be backfilled with all of their PO's item ids so nothing breaks.
   - Keep existing `po_id` + `vendor_id`; drop the implicit "one quote per vendor per PO" assumption in code so a vendor can have a quote covering a subset of items.
   - GRANTs already exist on these tables; no new GRANTs needed (only ADD COLUMN).

### Edge functions
- `get-vendor-quote`: return only the line items in the quote's `procurement_item_ids` (fall back to all items when the array is empty, for legacy links).
- `submit-vendor-quote`: unchanged logic, but validate submitted item ids are within the quote's invited set.

### Frontend — `src/components/procurement/ProcurementDetail.tsx`
- Extend `rateLines` state to carry `vendor_ids`, `rate_source`, `rate_source_vendor_id` per row.
- **Per-line Vendor(s) picker**: reuse the existing Popover + Checkbox pattern (extract a small `VendorMultiSelect` helper to avoid duplication), bound to each row.
- **Rate change handler**: when the user edits a rate whose `rate_source === 'quote'`, flip it to `'quote_adjusted'`; render tag accordingly (`From X's quote` / `Manually adjusted` / none).
- **Top Vendor(s)**: replace the selectable popover with a read-only text derived from `distinct(rateLines.flatMap(vendor_ids))` mapped through `vendorName`.
- **Quote actions moved into each line item card**:
  - Per-line "Generate/Share Quote Link" and comparison list, filtered to quotes whose `procurement_item_ids` include that line.
  - Add a **bulk invite** control (select line items + vendors) that creates quote rows carrying the chosen `procurement_item_ids`.
  - `applyVendorRates` becomes per line: sets that line's `rate`, `rate_source='quote'`, `rate_source_vendor_id`, recomputes only that line's amount.
- `savePoDetails` / line save: persist `vendor_ids`, `rate`, `amount`, `rate_source`, `rate_source_vendor_id` per `procurement_items` row; still write `total_amount` = sum of line amounts. Keep writing the PO-level `vendor_ids`/`vendor_id` as the derived distinct set (so existing list/report code that reads PO-level vendors keeps working).
- PDF (`buildQuoteDoc`) and WhatsApp message builders take a set of item ids + target vendor so they render only the invited lines.

### Frontend — `src/pages/VendorQuote.tsx`
- No structural change needed; it renders whatever items the edge function returns (now scoped per invitation).

### Totals verification
- `poEditTotal` already sums `rate * qty` across `rateLines`; confirm it and `order.total_amount` stay consistent after per-line saves, and Budget vs Actual reads the same `total_amount`.

### Notes / caveats
- Legacy PO-wide quotes remain valid via the `procurement_item_ids` backfill.
- No changes to GRN/Invoice logic; they already key off `procurement_item_id`.
