# Procurement Module Redesign

A full redesign of the Procurement module to enforce a correct purchase lifecycle: clean PO creation, button-driven approvals, a separate GRN (goods receipt) flow with partial receipts, invoice entry, and a 3-way match before closing.

## Status lifecycle

```text
Draft → Submitted → Approved → PO Sent → Partially Received → Fully Received → Invoice Pending → Closed
                       │
                       └→ Rejected  (admins/managers only)
```

- Users can only set **Draft** or **Submitted** on the PO form.
- All forward transitions and Reject are **buttons** on the PO detail screen, visible only to admins/managers.
- GRN receipts auto-drive the PO into Partially/Fully Received.

## 1. PO Form (Create / Edit)

- **Remove** GRN Number and GRN Status fields entirely (GRN never created at PO stage).
- Keep: Date, Vendor, PO Number, Site, Status (limited to Draft / Submitted).
- **Add** Expected Delivery Date (date).
- **Add** Payment Terms dropdown: Immediate, Net 15, Net 30, Net 60, Against Delivery.
- Line items get a **UOM** dropdown (Nos, Kg, Ton, Bags, Sqft, Rmt, Set), pre-filled from the product's default UOM but editable. Amount stays auto-calculated as Rate × Qty (already works).

## 2. Master Data

- Add a **Default UOM** field to Product Master (form + list) so line items can pre-fill it.

## 3. PO Detail Screen

Replace the current "tap card → edit" behavior with a detail view that shows:
- PO header, line items, totals, current status badge with a visual stepper.
- **Action buttons** (role-gated): Submit, Approve, Reject, Mark PO Sent, Close. Editing only allowed while Draft/Submitted.
- **Receive Goods (Create GRN)** button — enabled once status is Approved or PO Sent or Partially Received.
- A GRN list and an Invoices list for that PO.
- **3-Way Match** panel comparing PO qty / total received qty / invoiced amount, flagging rate mismatches.

## 4. GRN Flow (top-level nav item + PO detail)

- New **GRN** entry in the main navigation showing all receipts, plus GRN creation from the PO detail.
- GRN form: PO reference (auto-linked), Date of Receipt, Received By, per-item Ordered Qty vs Received Qty, Remarks, GRN Status (Pending / Partially Received / Fully Received / Rejected).
- **GRN Number auto-generated** (GRN-0001) at creation only.
- **Partial receipts**: if total received < ordered, PO → Partially Received and another GRN can be raised for the balance; when fully received, PO → Fully Received and is eligible for Invoice Pending.

## 5. Invoice Entry (separate, per PO)

- Dedicated invoice form per PO (multiple invoices allowed): Invoice Number, Invoice Date, Invoice Amount, optional per-item invoiced rate.
- Feeds the 3-way match. Moving PO to Invoice Pending / Closed happens via buttons after goods received.

## 6. 3-Way Match

- Summary screen on the PO detail matching PO quantity, GRN received quantity, and invoice amount.
- Visual flag whenever PO rate ≠ invoice rate, or qty/amount totals don't reconcile. Close button warns on mismatch.

---

## Technical details

### Database (migration)
- `procurement_orders`: drop usage of `grn_number`/`grn_status` (leave columns, stop writing); add `expected_delivery_date date`, `payment_terms text`. Status values updated to the new lifecycle set.
- `procurement_items`: add `uom text`.
- `master_products`: add `default_uom text`.
- New table `procurement_grns` (po_id FK, grn_number unique, receipt_date, received_by, status, remarks, created_by, timestamps). GRN number via a sequence + trigger (`GRN-0001`), mirroring the existing `set_activity_code` pattern.
- New table `procurement_grn_items` (grn_id FK, procurement_item_id FK, product_id, ordered_qty, received_qty).
- New table `procurement_invoices` (po_id FK, invoice_number, invoice_date, invoice_amount, created_by, timestamps); optional `procurement_invoice_items` for per-item rate matching.
- All new public tables get GRANT (authenticated + service_role) then RLS enabled with policies mirroring the existing procurement tables, plus `updated_at` triggers.
- A `profile_object_permissions` row already exists for `module_procurement`; add a `module_grn` permission row (or reuse `module_procurement`) so the new nav item shows for admins.

### Frontend
- Rewrite `src/pages/Procurement.tsx` into a list + detail flow; extract a `ProcurementDetail` view, `GRNForm`, `InvoiceForm`, and a `ThreeWayMatch` component (avoid inline sub-components per project convention).
- New `src/pages/GRN.tsx` for the top-level GRN list; add route in `src/App.tsx` and nav entry in `AppHeader`/navigation config.
- Role gating uses `useUserProfile` (`isAdmin`) plus the existing permission hook for managers.
- Update `src/pages/master/ProductMaster.tsx` for the Default UOM field.
- Status transition helper centralizing allowed next-states and who can trigger them.

### Out of scope
- No changes to unrelated modules. Entity remains removed.
