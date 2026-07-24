Two issues, both caused by how Salesforce-imported procurement records were mapped:

## 1. Vendor / PO amount showing ₹0.00

The PO list card and the vendor rows on the detail read `procurement_orders.total_amount`. All Salesforce-imported POs (PO-0025 to PO-0034) currently have `total_amount = 0` despite their line items carrying real rates (e.g. PO-0033 computed line total ≈ ₹2,52,866, stored total_amount = 0). The importer never populated the header total.

**Fix**
- Update `supabase/functions/import-salesforce-procurement/index.ts` to set `total_amount = sum(qty × rate)` across imported line items when writing/updating the `procurement_orders` row (both on the initial write and on the final status update). Do the same in `supabase/functions/bulk-import-salesforce-procurement/index.ts` if it writes header totals independently.
- Backfill existing rows with a one-shot SQL update:
  ```sql
  UPDATE procurement_orders po
  SET total_amount = sub.total
  FROM (SELECT procurement_id, SUM(COALESCE(rate,0)*COALESCE(qty,0)) AS total
        FROM procurement_items GROUP BY procurement_id) sub
  WHERE sub.procurement_id = po.id
    AND po.salesforce_id IS NOT NULL
    AND COALESCE(po.total_amount,0) = 0;
  ```

## 2. "Receive goods first" hides existing invoices

In `src/components/procurement/ProcurementDetail.tsx` (lines ~1950-1991) the Invoices accordion renders "Receive goods first — invoices can be added after the first GRN." whenever `!hasGrn`, so imported invoices (which have no GRN in Salesforce) never appear and can't be opened. The "1 Invoices" chip is populated from `vInvs`, but the list itself is suppressed.

**Fix (UI only, no schema change)**
- Always render the `vInvs` list when it is non-empty, regardless of `hasGrn`. The gating rule stays only on the "Add Invoice" button (keep it disabled with the "Receive goods first" tooltip when there's no GRN and no existing invoice for that vendor).
- New rendering order inside the accordion content:
  1. If `vInvs.length > 0` → render the existing clickable invoice list (opens `GRNDetail`/invoice dialog as today), so the imported invoice and its attachments are reachable.
  2. Else if `!hasGrn` → show the existing "Receive goods first…" hint.
  3. Else → "No invoices for this vendor yet."
- Also relax the "Add Invoice" gate for PO records that already have imported invoices (i.e. enable the button when `vInvs.length > 0` even without a GRN) so users can add follow-up invoices to Salesforce-migrated POs.

## Verification
- Reload `/procurement`: PO-0033 (single item ≈ ₹2.52L) shows non-zero amount on the list card and vendor row.
- Open PO-0034 → Invoices accordion shows the imported invoice; clicking opens the invoice with its Salesforce attachment.
- Newly imported / re-imported Salesforce records get `total_amount` set correctly on the first pass.
