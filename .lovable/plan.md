# Import Salesforce Products into Product Master

## What's in Salesforce
The products live in a custom object **`Product__c`** — **770 records**. Field usage:

| Salesforce field | Populated | Maps to Product Master |
|---|---|---|
| `Name` | all | `product_name` (exists) |
| `UOM__c` (free text) | 650 | `default_uom` (exists, text) |
| `Budgeted_rate_per_unit__c` (currency) | 437 | `budgeted_rate` (**new**) |
| `Lead_Time__c` (number, days) | 158 | `lead_time_days` (**new**) |
| `Product_Description__c` | 77 | `product_description` (**new**) |
| `Quality_instruction__c` (long text) | some | `quality_instruction` (**new**) |
| `Delivery_instruction__c` (long text) | some | `delivery_instruction` (**new**) |
| `Id` | all | `salesforce_id` (**new**, unique — dedup/re-sync) |
| `Product_Category__c` | **0** | — |
| `Product_Hierarchy__c` | **0** | — |

## Category & UOM findings (important)
- **Categories:** No category data exists in Salesforce — both the category lookup and hierarchy fields are empty on all 770 records. So **nothing needs to be added to Category Master**, and products will import with no category. They can be categorized later in Product Master.
- **UOM:** Salesforce has **51 distinct free-text UOM values** (e.g. `Nos`, `No`, `MT`, `Kgs`, `KG`, `Cmt`, `Coil`, `Bag`, `Bags`, `M3`, `CFT`, plus messy ones like `1`, `test`, `e.T.T`). The `default_uom` column is free text, so values import **as-is** (no data loss). The current dropdown (`UOM_OPTIONS`) only has 7 entries; it will be **expanded** with the common clean values so manual edits have a fuller list, while raw imported text is preserved.

## Plan

### 1. Database migration
Add to `master_products`:
- `product_description` (text)
- `budgeted_rate` (numeric)
- `lead_time_days` (integer)
- `quality_instruction` (text)
- `delivery_instruction` (text)
- `salesforce_id` (text) + unique index for de-duplication

### 2. Import Edge Function
Create `supabase/functions/import-salesforce-products/index.ts` (mirrors the vendor importer):
- Admin-only (JWT + `has_role` check).
- Paginates `SELECT ... FROM Product__c` via the Salesforce connector gateway.
- Maps fields per table above; UOM stored as raw text.
- Upserts into `master_products` keyed by `salesforce_id` (insert new, update existing). Returns `{ total, added, updated, skipped, errors }`.

### 3. UI — Product Master page
- Add an **"Import from Salesforce"** button (admin only) with a confirmation dialog and a result summary toast (added / updated / skipped).
- Extend the Add/Edit dialog with the new fields: Description, Budgeted Rate, Lead Time (days), Quality Instruction, Delivery Instruction.
- Add Budgeted Rate and UOM (already shown) columns; keep table readable.
- Expand `UOM_OPTIONS` in `src/lib/procurement.ts` with the common Salesforce UOM values.

## Notes
- Some product names appear more than once in Salesforce (e.g. different casing of the same item). Dedup is by `salesforce_id`, so each Salesforce record maps to one product; near-duplicate names will import as separate rows and can be cleaned up manually.
- Re-running the import is safe (updates existing records rather than duplicating).
