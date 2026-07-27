## Procurement Detail — header, stepper, and audit trail fixes

Three targeted fixes in `src/components/procurement/ProcurementDetail.tsx` (plus a small tweak in `src/components/procurement/lightning/LightningShell.tsx` and `src/index.css` for path styling). No business logic, permissions, or data model changes.

### 1) Site & Vendor empty in the Lightning record header — bug fix

`vendorName` and `siteName` are **functions** (`(id) => string`) passed in as props, but the Lightning `HighlightsPanel` is currently using them as if they were strings (`siteName || "—"`, `vendorName || "—"`), which always renders a truthy function reference and then falls back to empty when React coerces it.

Fix in the `HighlightsPanel` fields block (~line 1408–1416):

- `subtitle`: resolve to `vendorName(order.vendor_id) || siteName(order.site_id) || order.requisition_name`.
- `Site`: `siteName(order.site_id) || "—"` — for internal transfers, show `From → To` using `transfer_from_site_id` and `site_id`.
- `Vendor`: use the derived finalized/summary vendor list already computed in the component (`summaryVendorIds` / `vendorSummaries`) so it reflects post-approval assignments; fall back to `order.vendor_id`. For internal transfers, render `—` (no vendor concept).
- Also add `Requisition #` and `Owner` (created-by name) as fields, matching Salesforce highlights.

### 2) Stepper labels getting truncated

Root cause: desktop chip column is locked to `max-w-[110px]` with `whitespace-nowrap`, so "Requisition Approved" and "Invoice Received" clip.

Changes to the desktop horizontal stepper (classic mode, ~line 1452–1471):

- Drop `max-w-[110px]` and `whitespace-nowrap` on the chip; allow the chip to size to its content with `px-2.5 py-1`.
- Make the row horizontally scrollable on smaller desktops (`overflow-x-auto`) so long lifecycles never wrap awkwardly.
- Increase per-step column min width to fit meta lines (`min-w-[132px]`).

For Lightning mode, update `.sf-path` in `src/index.css` and `PathBar` in `LightningShell.tsx` so each chevron step:

- Uses `white-space: nowrap` on the label but allows the strip to horizontally scroll on narrow widths.
- Reserves enough padding for the longest SLDS-style label.

Mobile vertical timeline already wraps correctly — no change.

### 3) Complete audit trail (who / when / remarks) — full timeline section

Today only `historyByStatus` (latest entry per status) is shown as tiny meta under each chip. Add a proper "Stage History" related list that surfaces every transition in chronological order, similar to Salesforce's activity/history related list.

Add a new **Stage History** card rendered directly under the stepper in both classic and Lightning modes:

- Iterates the full `stageHistory` array (already loaded from `order.stage_history`), sorted ascending by `moved_at`.
- One row per transition showing:
  - Status badge (using `statusColor`)
  - Actor: `moved_by_name` — with a small "System" pill when `auto === true`
  - Date + time: `moved_at` formatted as `dd MMM yyyy, HH:mm` (locale `en-GB`)
  - Remarks: `note` (if any), rendered in italic muted text
- Empty state: "No stage transitions recorded yet." when the array is empty.
- In Lightning mode wrap in the SLDS related-list card styling (`sf-related-list`), matching the other tabs.

The per-chip meta under the stepper stays (still useful glanceable info), but the full audit is now the source of truth beneath it.

### Files touched

- `src/components/procurement/ProcurementDetail.tsx` — fix HighlightsPanel field values, widen desktop stepper chips, add Stage History card component + render.
- `src/components/procurement/lightning/LightningShell.tsx` — minor `PathBar` markup tweak to prevent label clipping.
- `src/index.css` — extend `.sf-path` / `.sf-path-step` under `.lightning-ui` for nowrap + horizontal scroll.

### Not changing

- `stage_history` schema, how transitions are recorded, `computeAutoTarget`, permissions, PDF/WhatsApp share, or any other workflow. This is presentation-only.
