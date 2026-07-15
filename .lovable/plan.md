## Sync Product Master from Excel

Source file: `Product_Category_Mapping_1_1.xlsx` → sheet **Product-Category Mapping** (594 products across 10 categories).

### Categories
All 10 categories in the sheet already exist in `master_categories` (Cement & Aggregates, Electrical & Plumbing, Construction Materials, Other Expenses, Construction Works, Consultancy, Carpentory, Transport, Fabrication, Survey). No changes needed.

### Product actions (executed via a data migration)

1. **Update category** for 547 existing products whose name matches an Excel row → set `category_id` to the mapped category.
2. **Insert** 47 new products from the Excel that don't exist in DB, with the mapped `category_id`, `is_active = true`.
3. **Deactivate** 186 DB products not in the Excel by setting `is_active = false` (includes "TMT Steel Bar" which is referenced by an existing PO — kept for history, hidden from selection). No hard deletes.

### Matching rule
Exact match on `product_name` (case-sensitive, trimmed). No fuzzy matching to avoid accidental mislabeling.

### Deliverable
A single SQL migration that performs the update / insert / deactivate in one transaction. No UI changes.
