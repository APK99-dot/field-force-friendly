# Full Salesforce Lightning Redesign — Procurement Module

The current Lightning toggle only restyled the outer header. This plan extends the SLDS-inspired treatment across every Procurement surface so the entire module feels like a Salesforce Lightning app when the toggle is on. No business logic, data, permissions, or navigation changes — pure UI.

## Scope (all screens)

1. **Procurement list** (`src/pages/Procurement.tsx`)
2. **Procurement detail** (`src/components/procurement/ProcurementDetail.tsx`) — the largest surface
3. **Vendor 360°** (`src/pages/VendorDetail.tsx`)
4. **Vendors list** (`src/pages/Vendors.tsx`) — for consistency when navigating from Vendor 360
5. **Supporting dialogs** rendered inside the above: `GRNForm`, `GRNDetail`, `InvoiceForm`, `ReceiveGoodsDialog`, `OpenGRNPicker`, `SalesforceImportDialog`, `SalesforceBulkImportDialog`, `VendorRating`

Out of scope: GRN standalone page (`pages/GRN.tsx`) and non-procurement modules stay classic.

## Design system additions (`src/index.css`, `.lightning-ui` scope)

Extend the existing `.lightning-ui` layer with the SLDS primitives we still need:

- **App-level chrome**: subtle grey app background (`#f3f3f3`), white record surface, 1px `#dddbda` borders, 2px radius, SLDS shadow ramp.
- **Typography**: 13px base, 11px uppercase labels with 0.05em tracking, `#080707` headings, `#3e3e3c` body, `#706e6b` meta.
- **Record header** (`sf-record-header`): compact 2-row layout — object icon tile + eyebrow/title/subtitle, right-aligned action cluster, followed by inline field row with vertical dividers.
- **Path bar** (already added): tighten chevron sizing, add hover, "Mark Status as Complete" affordance stays classic (still driven by existing Advance button).
- **Related lists** (`sf-related-list`): card with header strip (icon + title + count + "View All"), dense table (32px rows, 11px header caps, hover row, zebra optional), inline row actions dropdown.
- **Tabs** (`sf-tabs`): underline tabs in SLDS blue (`#0176d3`), 40px tall, sticky under the header when scrolling.
- **Buttons**: brand (`#0176d3` bg / white text), neutral (white / border / `#0176d3` text), destructive (`#ba0517`). Height 32px, radius 4px.
- **Badges/pills** (`sf-badge`): neutral grey by default; success/warning/error/info variants that map to existing status colors without changing hues drastically.
- **Modals/dialogs** (`sf-modal`): white header strip with object icon + title, footer bar with right-aligned actions, `#f3f3f3` body.
- **Toasts**: leave shadcn as-is (out of scope), but ensure they render above the SLDS surface.
- **Dark mode**: keep classic behavior. Lightning styles apply in light mode only; when the user is in dark mode we still render `.lightning-ui` but map neutrals to a dark SLDS palette (surface `#1b1b1b`, border `#3e3e3c`).

All tokens live under `.lightning-ui` so classic mode is untouched.

## New shared components (`src/components/procurement/lightning/`)

Additive, opt-in via `isLightning(mode)`:

- `RecordHeader.tsx` — replaces the ad-hoc header we added; renders object icon, eyebrow, title, subtitle, inline field row, action cluster, and a slot for the `PathBar` directly beneath.
- `RelatedList.tsx` — wraps a titled card with count, optional "New"/"View All" actions, and children (table or empty state).
- `SldsTable.tsx` — thin wrapper over shadcn `Table` that applies dense SLDS classes (used inside RelatedList).
- `SldsTabs.tsx` — wraps shadcn `Tabs` with SLDS underline styling and sticky top offset.
- `SldsDialog.tsx` — wraps shadcn `Dialog` with SLDS header/footer chrome; existing dialogs opt in by swapping their outer wrapper when `isLightning`.

Each component falls back to today's classic markup when the mode is off, so we can wrap render blocks with a single conditional per file.

## Per-screen changes

### Procurement list (`Procurement.tsx`)
- Wrap in `sf-app-surface` when Lightning is on.
- Replace current header row with `RecordHeader` (icon = ShoppingCart, title = "Procurement", subtitle = "<count> orders", actions = New Requisition + Salesforce Import + Lightning toggle).
- Filter/search bar becomes an SLDS "list view controls" strip (white, bordered, dense).
- Card grid becomes an SLDS list view table on desktop (dense rows, columns: PR #, Status pill, Site, Owner, Amount, Updated, row actions). Keep the current card layout on mobile so the responsive story survives.

### Procurement detail (`ProcurementDetail.tsx`)
This is the bulk of the work. In Lightning mode:
- Swap the current dialog wrapper for `SldsDialog` (full-height on desktop, SLDS chrome).
- Render `RecordHeader` with PO/TRF number, status badge, key fields (Site, Vendor summary, Grand Total, Owner, Created), and the existing action buttons (Advance, Revert, Download, Share).
- Directly under, render `PathBar` using existing `stepFlow`/`stepIndex`.
- Convert the body into `SldsTabs` with tabs: **Details**, **Vendor Comparison**, **Vendors** (per-vendor accordion dashboard), **GRNs**, **Invoices**, **Payments**, **Activity** (audit trail). Each tab body uses `RelatedList` cards.
- The vendor-centric accordion (finalized vendors with Quote/GRNs/Invoices/Financials/Audit sub-sections) stays intact — it just moves inside the "Vendors" tab and each sub-section becomes an SLDS related list card.
- All existing handlers, automation, and gating (`computeAutoTarget`, quote versioning, rate-source logic, permission checks) are reused unchanged.
- Mobile: tabs stack; header collapses; PathBar switches to the existing vertical timeline component.

### Vendor 360° (`VendorDetail.tsx`)
- Wrap in `LightningShell` + `sf-app-surface` (finish the pending edit).
- `RecordHeader` with vendor icon, name, status badge, performance flag, key fields (Category, Payment terms, Total spend, Open POs, Rating).
- Convert existing tabs to `SldsTabs`; each tab body wrapped in `RelatedList` cards (Requisitions, Quotations, POs, GRNs, Invoices, Payments, Documents, Performance).
- Cards inside tabs become dense SLDS tables with the existing click-through navigation preserved.

### Vendors list (`Vendors.tsx`)
- Same treatment as Procurement list: `RecordHeader`, SLDS list view controls, dense table on desktop, cards on mobile.
- Add the same Lightning toggle in the header so users can flip modes from either entry point.

### Supporting dialogs
- Wrap each in `SldsDialog` when `isLightning`. Content grids inside (form rows, tables) reuse `SldsTable` where applicable.
- No field logic, validation, or submit flow changes.

## Toggle & persistence
- `useUiMode` already persists per-browser under `bb.ui.procurement`. Reuse as-is.
- Add a small "Lightning" toggle in the Vendors list header too (Procurement list and detail already have one).

## Not changing
- Business logic, edge functions, DB schema, RLS, permissions, automation, computeAutoTarget, quote versioning, status flows, notifications, PDF/WhatsApp share.
- Navigation routes, deep-link query params, keyboard shortcuts.
- Classic mode — every surface renders exactly as today when the toggle is off.

## Technical notes
- All conditional rendering is `isLightning(mode) ? <Lightning …/> : <Classic …/>` at the top of each render block; no prop-drilling of the mode past one level.
- CSS additions live under `.lightning-ui` — no risk of leaking into other modules.
- No new dependencies.
- Files touched (approx.):
  - `src/index.css` (extend `.lightning-ui`)
  - `src/components/procurement/lightning/{RecordHeader,RelatedList,SldsTable,SldsTabs,SldsDialog}.tsx` (new)
  - `src/pages/Procurement.tsx`
  - `src/pages/Vendors.tsx`
  - `src/pages/VendorDetail.tsx`
  - `src/components/procurement/ProcurementDetail.tsx`
  - Light wrapper swaps in `GRNForm.tsx`, `GRNDetail.tsx`, `InvoiceForm.tsx`, `ReceiveGoodsDialog.tsx`, `OpenGRNPicker.tsx`, `SalesforceImportDialog.tsx`, `SalesforceBulkImportDialog.tsx`

## Rollout
1. Land CSS tokens + new shared Lightning components.
2. Migrate Procurement list → detail → Vendor 360 → Vendors list → supporting dialogs, in that order.
3. Manual QA in both modes at each step to confirm classic UI is unchanged.
