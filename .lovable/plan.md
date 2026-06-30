## Goal

Introduce **Internal Transfer** as a second procurement type next to the existing **Vendor Purchase** flow — site-to-site material movement with no money, a shorter lifecycle, its own number series (TRF-0001), and a transfer-aware Goods Receipt.

## 1. Database changes (migration)

Add to `procurement_orders`:
- `source_type` text, default `'vendor'` (values: `vendor`, `internal_transfer`)
- `transfer_from_site_id` uuid (source site giving material; destination reuses existing `site_id`)

Number series:
- Create a new sequence `trf_number_seq`.
- Update the `set_po_number()` trigger so that when `source_type = 'internal_transfer'`, it generates `TRF-####` into `po_number` (reuse the existing `po_number` column so list/detail/GRN linking stays unchanged); otherwise keep `PO-####` as today. Number is assigned the first time the record leaves `Requisition`, same as now.

Migrate existing rows: set `source_type = 'vendor'` for all current orders (covered by the default).

No new tables, so existing RLS/grants on `procurement_orders` continue to apply.

## 2. Shared logic — `src/lib/procurement.ts`

- Add an internal-transfer status flow: `Requisition → Requisition Approved → Goods Received → Closed`.
- Make `allowedTransitions(status, sourceType)` and the stepper flow source-type-aware:
  - Internal Transfer transitions: Requisition → Requisition Approved (approver) → Goods Received (approver) → Closed (approver).
  - Vendor flow unchanged.
- Export a helper `statusFlowFor(sourceType)` returning the correct ordered array for the stepper.
- Keep `PROC_STATUSES` (used by the list filter) as the union — no new statuses are introduced, so the filter dropdown is unaffected.

## 3. New Procurement form — `src/pages/Procurement.tsx`

- Add `source_type` to `emptyForm` (default `vendor`) plus `transfer_from_site_id`.
- Add a **Source Type** toggle (radio/segmented) at the very top of the form: *Vendor Purchase* (default) and *Internal Transfer*.
- Conditional rendering:
  - **Vendor Purchase**: existing fields unchanged (Site, Vendor(s), Estimated Budget, Bill To, Ship To, line items with later rates).
  - **Internal Transfer**: show Date, Requested By (read-only), **Transfer From Site** (dropdown), **Transfer To Site** (the existing `site_id` field, relabeled), Product Line Items (Material, UOM, Qty only — no rate inputs), and **Notes / Reason for Transfer**. Hide Vendor, Bill To, Ship To, Estimated Budget.
- `handleSave`: when internal transfer, persist `source_type`, `transfer_from_site_id`, `site_id` (destination), null out vendor/bill/ship/budget, and write line items with `rate = 0`, `amount = 0`. Validation requires Transfer From + Transfer To + at least one line with qty.
- List view: add a badge on each card — **"Vendor PO"** or **"Internal Transfer"** — next to the status badge. For transfers, show "From → To" sites instead of the vendor line, and hide the amount/budget display.
- The "New PO" button label/heading stays; the type is chosen inside the form.

## 4. Detail screen — `src/components/procurement/ProcurementDetail.tsx`

- Extend `DetailOrder` with `source_type` and `transfer_from_site_id`.
- Stepper uses `statusFlowFor(order.source_type)`.
- For internal transfers: header card shows Transfer From / Transfer To sites (no vendor, no Bill/Ship To, no budget card, no payment terms / rates / invoice section). Show the transfer reason notes.
- `canReceive` for transfers becomes true at `Requisition Approved` / `Goods Received` (since there is no PO Issued stage). Hide the Invoices card and rate-editing UI for transfers.
- Transitions filtered through the source-type-aware `allowedTransitions`.

## 5. Goods Receipt — `GRNForm.tsx` / `ReceiveGoodsDialog.tsx`

- Pass `sourceType` and `transferFromSiteName` through `ReceiveGoodsDialog` → `GRNForm`.
- In `GRNForm`, when source is internal transfer: replace the vendor context with a read-only **"Transferred From Site"** display, and hide the optional vendor-feedback (star rating) block. All else — receipt date, received by, ordered vs received, photos, GRN status — stays identical.
- GRN records still link via `po_id`, so no GRN schema change is needed.

## 6. List/filter touch-ups

- `OpenGRNPicker.tsx`: include `Requisition Approved` in open statuses **only for transfers** when used in transfer context (or rely on the detail-screen "Receive Goods" button, which is the primary entry). Show site name instead of vendor for transfer rows.

## Technical notes

- `po_number` column is reused for the TRF series to avoid touching GRN/detail/list lookups; only the prefix differs by `source_type`.
- No changes to GRN, invoice, or item table schemas.
- Existing vendor POs are unaffected (default `source_type = 'vendor'`).
- Status filter dropdown keeps the full vendor status set; transfer records simply never enter the vendor-only statuses.

## Out of scope / confirm later

- Inventory stock-level adjustments at source/destination sites are **not** part of this (no stock ledger exists today) — transfers are tracked as documents only.
