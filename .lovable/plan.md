
## Scope

Change is UI/presentation only inside `src/components/procurement/ProcurementDetail.tsx`. No schema, no data-model, no edge-function changes. All existing state, handlers (`setGrnOpen`, `setInvOpen`, `scopedVendorId`, `setSelectedGrn`, `setSelectedInvoiceId`, `vendorSummaries`, `quote`, etc.) are reused.

## What changes

### 1. Vendor row summary badges (collapsed state)

Beside each vendor row (in the "Assign Vendors" table, either in the vendor cell or a new lightweight column), render compact chips derived from existing data:
- GRN count: `N GRN`
- Invoice count: `N Invoices`
- Paid amount: `₹X Paid` (from `finSummary.paid_total`)
- Balance: `Balance ₹Y` (green if 0, red if > 0)

Also add a color-coded quote status pill next to the vendor name (grey/blue/orange/green/dark-green/purple/emerald mapping below).

### 2. Expanded panel = accordion "workflow dashboard"

Replace the current flat stack under the expanded row (lines ~1588–1766) with a single scroll-contained container:

```text
[Vendor name] [status pill] [N GRN] [N Invoices] [₹Paid] [Balance]
──────────────────────────────────────────────────────────────
Compact timeline:  ✓ Submitted 21/07 14:41  ↺ Reopened 22/07  📝 Changes 22/07
──────────────────────────────────────────────────────────────
Accordion (shadcn Accordion, single-open, defaultValue="grns"):
  ▸ Goods Receipts (N)          [+ Receive Goods]   ← primary, open by default
  ▸ Invoices (N)                [+ Add Invoice]     ← primary
  ▸ Financial Summary            (chips + payment schedule)
  ▸ Quote Details                 (submitted / reopened / attachments / items in scope)
```

Rules:
- Accordion items with zero relevant content are hidden entirely (e.g. no attachments → no "attachments" line; no timeline events → no timeline row).
- The whole expanded panel wraps in `max-h-[75vh] overflow-y-auto`, and each list (GRNs, Invoices, Attachments, Items in scope) uses its own `max-h-40 overflow-y-auto` so long lists scroll inside their subsection rather than blowing the panel out.
- Vertical spacing tightened (`space-y-2` between accordion items; remove redundant uppercase headings replaced by accordion trigger label).

### 3. Timeline (replaces "Quote Audit Trail" card)

Single-line horizontal (wraps on mobile) using `first_submitted_at`, `reopened_at`, `last_resubmitted_at`, and presence of `changes_requested` status:
- `✓ Quote Submitted – dd/MM/yyyy HH:mm`
- `↺ Reopened – dd/MM/yyyy HH:mm`
- `📝 T&C Changes Requested – dd/MM/yyyy HH:mm` (uses latest `submitted_at` when status is `changes_requested`)

Rendered as small chips with muted background; hidden if no events exist.

### 4. Items in scope truncation

Under "Quote Details" accordion, replace the current per-item list with:
- Inline text: `"Item A, Item B +N more"` (first 2 names).
- `+N more` is a `Popover` trigger showing the full scoped list (name · qty · rate) with `max-h-56 overflow-y-auto`.
- If ≤ 2 items, render all inline without popover.

### 5. Color-coded status mapping (single helper)

Add a small local helper `quoteStatusStyle(s)` used by both the collapsed row pill and expanded header:
- `draft` → grey (`bg-muted text-muted-foreground border-border`)
- `reopened` → blue (`bg-blue-100 text-blue-700 border-blue-300` + dark variants)
- `changes_requested` → orange (`bg-orange-100 text-orange-700 border-orange-300`)
- `submitted` → green (`bg-emerald-100 text-emerald-700 border-emerald-300`)
- Derived per-vendor PO progression pill (shown next to the summary badges):
  - Fully received (all scoped GRNs reconcile qty for this vendor) → dark green
  - Any invoice exists → purple
  - Fully paid (balance == 0 and invoiced > 0) → emerald
  These are additive; only the "highest" applicable one is shown.

### 6. GRN / Invoice sections stay actionable but compact

Keep existing GRN and Invoice rendering logic and click-through to `setSelectedGrn` / `setSelectedInvoiceId`, but:
- Move `Receive Goods` button into the Goods Receipts accordion trigger row (right-aligned).
- Move `Add Invoice` button into the Invoices accordion trigger row (disabled with tooltip "Receive goods first" when `!hasGrn`).
- Row density reduced (`py-1 text-[11px]`), status badge on GRN reuses `statusColor(g.status)`.

### 7. Removed / consolidated

- Standalone "Financials" grid section becomes the "Financial Summary" accordion body (same data, no visual regression).
- Empty "No items selected." / "No invoices for this vendor yet." states remain but sit inside their respective accordion sections; empty accordions are hidden entirely, except GRNs and Invoices which always render (they carry the primary actions).

## Non-goals

- No changes to line-items table, quote comparison table, T&C change-request banner, or top-level PO details.
- No new tables, columns, or backend calls.
- No changes to `GRNForm`, `InvoiceForm`, `GRNDetail`, or Invoice detail dialog.

## Technical notes

- Uses existing shadcn `Accordion` (`@/components/ui/accordion`) — already available in the codebase.
- New helpers defined inline in the file: `quoteStatusStyle`, `vendorProgressPill(finSummary, vGrns, vInvs)`, `formatTimelineDate(iso)`.
- All changes confined to the expanded-row JSX block (roughly lines 1588–1766) plus a small addition to the collapsed row for summary chips (around lines 1401–1445 vendor cell area).
