# Salesforce Lightning Redesign – Procurement Module

Rework the Procurement list, Procurement detail, and Vendor 360° pages to look and feel like Salesforce Lightning record pages while preserving every existing workflow, data operation, and permission check. Ships behind a per-user toggle so users can switch back to the current UI.

## Goals

- Adopt Lightning's visual grammar: Highlights Panel header, Path (stage bar), Related-lists-as-tabs, compact utility bar.
- Keep all existing business logic, RPCs, mutations, status automation, geofencing, vendor comparison math, and DB schema untouched.
- Hybrid theme: current Navy & Gold brand tokens for primary/accent; borrow Lightning's neutral surfaces, borders, and typography scale for structure.

## Scope

Redesigned:
- `src/pages/Procurement.tsx` (list)
- `src/components/procurement/ProcurementDetail.tsx` (detail)
- `src/pages/VendorDetail.tsx` (vendor 360°)

Not changed: schema, edge functions, hooks, GRN/Invoice/Payment forms internals, permissions, routes.

## UX Blueprint

### 1. List page — "Requisitions" object home
```text
┌ Utility bar: object icon + title "Requisitions" · count · New button ─────────┐
│ List view selector ▼   Search   Filters   Sort   Refresh   Kanban/Table view │
├──────────────────────────────────────────────────────────────────────────────┤
│ Row: REQ# · Title · Site · Owner · Amount · Stage pill · Age · Actions ▾     │
└──────────────────────────────────────────────────────────────────────────────┘
```
- Compact Lightning-density rows (desktop table, mobile cards preserved).
- Stage pill uses SLDS-style rounded chip with our Navy accents.
- Kept: search, all filters, pending-only, TRF vs vendor differentiation, KPIs (moved into a slim strip above table).

### 2. Detail page — Lightning record page
```text
┌ Highlights Panel ────────────────────────────────────────────────────────────┐
│ [icon] REQ-0026  Rmx Concrete India                    [Advance] [More ▾]    │
│ Site · Owner · Created · Amount · Payment status  · Bill To · Ship To        │
├─ Path (stage bar) ───────────────────────────────────────────────────────────┤
│ ● Requisition → ● Approved → ○ Quote Requested → ○ … → ○ Closed              │
├─ Tabs: Details | Vendor Comparison | GRNs | Invoices | Payments | Activity ─┤
│ Two-column field grid, inline-edit where allowed today (delivery date,       │
│ payment terms, rates once unlocked).                                         │
└──────────────────────────────────────────────────────────────────────────────┘
```
- Vendor accordion → **Related tab per topic**; each tab shows the current accordion body as a Lightning related list with row-level actions.
- Mobile: tabs collapse into a horizontal scroller; Path becomes vertical timeline (reuse existing).
- All current actions (Advance, Revert, Record Payment, Receive Goods, Add Invoice, Reopen quote, WhatsApp share, PDF) stay — repositioned into Highlights Panel button group + row overflow menus.

### 3. Vendor 360° — Lightning record page
- Same Highlights + Path-less header; tabs: Overview, Requisitions, Quotations, POs, GRNs, Invoices, Payments, Documents, Performance (current tabs).
- Related lists restyled with SLDS row density; KPI tiles restyled as Lightning "report tiles".

## Design tokens (hybrid)

Add a scoped token layer in `src/index.css` under `.lightning-ui` class (only applied when toggle is on):
- Surfaces: `--sf-surface: #fff`, `--sf-surface-alt: #f3f3f3`, `--sf-border: #e5e5e5`.
- Text: `--sf-text: #181818`, `--sf-text-weak: #706e6b`.
- Accent (hybrid): primary/link use existing Navy; success/warn/error keep SLDS semantics.
- Typography: SF/Inter fallback stack, 13px base, 12px meta, 15/17px headings — matches Lightning density.
- Radius: 4px cards, 12px pills.
- Shadows: subtle `0 2px 2px rgba(0,0,0,.05)` on cards.

No hardcoded hexes in components — all via new CSS variables and Tailwind arbitrary values referencing them.

## Toggle mechanism

- New user preference `ui_mode: 'classic' | 'lightning'` stored in `localStorage` (`bb.ui.procurement`).
- Toggle in Procurement page header ("Lightning view" switch) + persisted per user.
- Wrap the three redesigned pages in a `<LightningShell>` that applies the `.lightning-ui` class and swaps layout components; classic renders existing components unchanged.

## New files

- `src/components/procurement/lightning/HighlightsPanel.tsx`
- `src/components/procurement/lightning/PathBar.tsx`
- `src/components/procurement/lightning/RelatedTabs.tsx`
- `src/components/procurement/lightning/ListShell.tsx`
- `src/components/procurement/lightning/RecordField.tsx` (label + value + inline-edit slot)
- `src/hooks/useUiMode.ts`
- Token additions in `src/index.css`

## Changed files

- `src/pages/Procurement.tsx` — render `ListShell` when Lightning mode; keep current tree otherwise.
- `src/components/procurement/ProcurementDetail.tsx` — extract body sections (Vendor Comparison, GRNs, Invoices, Payments, Audit) into slots consumed either by current accordion (classic) or `RelatedTabs` (Lightning). No logic changes to handlers.
- `src/pages/VendorDetail.tsx` — same slot extraction; Lightning shell wraps.

## Preservation checklist (must remain identical)

- Status automation (`computeAutoTarget`), vendor rollups, ₹1 tolerance, geofencing.
- Advance/Revert permissions, Record Payment flow, GRN → Invoice ordering rule, quote versioning.
- Deep links (`?po=`, tab/vendor query params), search, filters, KPI values.
- Salesforce import, PDF, WhatsApp share, attachments.
- Mobile responsiveness parity or better.

## Out of scope

- No DB migrations, no edge function edits, no route changes, no permission changes.
- No changes to GRN form, Invoice form, Payment form internals — only their container chrome.
- Other modules (Activities, Attendance, etc.) untouched.

## Verification

- Toggle off → pixel-equivalent to current UI (regression check).
- Toggle on → visual QA against provided Salesforce screenshots on desktop + mobile.
- Smoke test each action: Advance, Revert, Assign vendor, Record Payment, Receive Goods, Add Invoice, Reopen quote, PDF, WhatsApp, deep-link from Vendor 360°.
