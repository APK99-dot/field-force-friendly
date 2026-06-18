# Procurement & Master Data Expansion

Adds a new top-level **Procurement** module and three new master-data screens (Category, Product, Entity) grouped under the existing **Master Data** section. All data is stored in new dedicated tables with row-level security and admin-gated UI, following the existing Vendor / Activity Type Master patterns.

## 1. Master Data additions

The Master Data page (`/master-data`) gets three new cards:

- **Category Master** → `/master-data/categories`
  - Fields: Category Name, Sub Category Name, Status (Active/Inactive)
- **Product Master** → `/master-data/products`
  - Fields: Product Name, Category, Sub Category, Status
  - Category & Sub Category are chosen from Category Master entries
- **Entity Master** → `/master-data/entities`
  - Fields: Entity Name, Entity Code, Address, GST Number, Contact Person, Contact Number, Status

Each screen mirrors the existing Activity Type Master layout: a table with Add/Edit/Delete dialogs, status toggle badge, and search. Vendor Master and Activity Type Master cards stay as they are.

## 2. Procurement module (top-level navigation)

New nav item **Procurement** (alongside Activities, Expenses, etc.) at `/procurement`, gated by a new permission module.

Each procurement order (Purchase Order) has:

- Date
- Vendor (from Vendor Master)
- PO Number
- Site (from Projects/Sites)
- Entity (from Entity Master)
- Status: Draft, Submitted, Approved, PO Issued, Partially Received, Received, Closed, Rejected, Cancelled
- GRN Number + GRN Status (simple fields on the order)

Plus multiple **product line items**, each with:

- Product (from Product Master)
- Rate
- Qty
- Amount (auto-calculated = Rate × Qty; order shows a grand total)

UI: a list of procurement orders (card list with PO number, vendor, site, status badge, total) and a create/edit form (full-screen dialog/sheet) where line items can be added/removed dynamically, similar to the Vendor multi-entry pattern.

## 3. Navigation & permissions

- `AppHeader.tsx` and `More.tsx`: add **Procurement** to `allNavigationItems` (icon `ShoppingCart`, gated by `module_procurement`).
- `MasterData.tsx`: add the three new master cards (admin/module gated).
- Add a `module_procurement` row to `permission_definitions` plus object permissions so Security & Access can grant access; default to System Administrators (consistent with current admin-only gating via `isAdmin` / `hasModuleAccess`).

## Technical details

### New database tables (migration)
All in `public`, with `created_at`/`updated_at` + update trigger, GRANTs to `authenticated` and `service_role`, RLS enabled.

- `master_categories` — `category_name text`, `sub_category_name text`, `is_active boolean default true`, `created_by uuid`
- `master_products` — `product_name text`, `category_id uuid references master_categories`, `is_active boolean`, `created_by uuid`
  - (Category + Sub Category both come from the chosen `master_categories` row, which already pairs them.)
- `master_entities` — `entity_name text`, `entity_code text`, `address text`, `gst_number text`, `contact_person text`, `contact_number text`, `is_active boolean`, `created_by uuid`
- `procurement_orders` — `order_date date`, `vendor_id uuid references vendors`, `po_number text`, `site_id uuid references project_sites`, `entity_id uuid references master_entities`, `status text default 'Draft'`, `grn_number text`, `grn_status text`, `total_amount numeric default 0`, `created_by uuid`
- `procurement_items` — `procurement_id uuid references procurement_orders on delete cascade`, `product_id uuid references master_products`, `rate numeric`, `qty numeric`, `amount numeric`

RLS policies: authenticated users can read; create/edit/delete limited to admins (using existing `has_role(auth.uid(),'admin')`) consistent with current master-data screens. Adjustable later via Security & Access.

### New files
- `src/pages/master/CategoryMaster.tsx`
- `src/pages/master/ProductMaster.tsx`
- `src/pages/master/EntityMaster.tsx`
- `src/pages/Procurement.tsx` (list + create/edit form with line items)
- Optional shared hook(s) for fetching masters via TanStack Query.

### Edited files
- `src/App.tsx` — add lazy routes for the four new pages.
- `src/pages/MasterData.tsx` — add Category, Product, Entity cards.
- `src/components/layout/AppHeader.tsx` and `src/pages/More.tsx` — add Procurement nav item.

### Seed
- Insert `module_procurement` permission definition + object permission rows.

No changes to the existing (empty) `products` / `product_categories` tables — new dedicated tables avoid conflicts with `orders`/`order_items`.
