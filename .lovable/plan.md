## Goal

Replace the current Reports module with an **Analytics dashboard** that copies the visual styling from the Quickapp screenshot (gradient banner cards, KPI strip, "Summary by User" pie/bar chart + table with Top5/Bottom5 toggle), but driven entirely by Bharath Builders' own data (Attendance, Activities, Expenses, Procurement, Milestones, Sites, Employees).

The three Quickapp tabs (Productivity / Target / Products) are replaced by seven module tabs:
**Overview · Attendance · Procurement · Activities · Milestones · Expenses · Payments**

## Layout (matches screenshot)

```text
[ < ]  Overview  Attendance  Procurement  Activities  Milestones  Expenses  Payments  [ > ]
                                                          [ Download PDF ]
┌───────────────────────────┐  ┌───────────────────────────┐
│ Total Activities  (dark/   │  │ Present Days   (primary/   │
│  gold border) 1,234        │  │  purple) 856               │
│ Jun 22 – Jun 26, 2026      │  │ Jun 22 – Jun 26, 2026      │
└───────────────────────────┘  └───────────────────────────┘
[Active Sites] [Employees] [PO Value ₹] [Pending Approvals] [Expenses ₹]
┌──────────────────────────────────────────────────────────┐
│ Activity Summary by User        [Top5][Bottom5]  [pie|bar|hide] │
│   ◐ pie chart           │   table: Full Name | Count | %        │
└──────────────────────────────────────────────────────────┘
```

## Tabs

- **Overview** — the screenshot layout above:
  - Banner cards: **Total Activities** (dark gradient, gold border) and **Present Days** (primary/purple gradient).
  - KPI strip (5 cards): **Total Active Sites**, **Total Employees**, **Total PO Value (₹)**, **Pending Approvals**, **Total Expenses (₹)**.
  - **Activity Summary by User**: pie/bar/hide toggle (recharts), Top5/Bottom5 toggle, and a table (Full Name, Activity Count, % share) — same look as the screenshot's "Order Summary by User".
- **Attendance / Procurement / Activities / Milestones / Expenses / Payments** — each renders the existing report component for that module (filters + data table + Download PDF), wrapped in the same styled shell so they look consistent with Overview.

Each tab keeps its own date/scope filters and a **Download PDF** button (existing PDF generator reused).

## Routing & cleanup

- `/reports` now renders `src/pages/Analytics.tsx` (the new tabbed dashboard). The old card-grid `Reports.tsx` landing and `ReportView.tsx` route become unused.
- The "Reports" entry in the More page / header stays but points to the same `/reports` route (now the Analytics dashboard). Label can stay "Reports" or change to "Analytics" — I'll keep "Reports" unless you say otherwise.

## Data mapping (Bharath Builders)

- **Total Activities** = count of `activity_events` in range (scoped via `useReportScope`).
- **Present Days** = count of present `attendance` records in range.
- **Active Sites** = count of active `project_sites`.
- **Total Employees** = count of active `users` in scope.
- **Total PO Value** = SUM(`procurement_orders.total_amount` equivalent) in range.
- **Pending Approvals** = pending `leave_applications` + pending `additional_expenses` (+ requisition-stage POs).
- **Total Expenses** = SUM(`additional_expenses.amount`) in range.
- **Activity Summary by User** = group `activity_events` by user → activity count; Top5/Bottom5 + % share.
- **Payments tab** = procurement invoice payments (`procurement_invoice_payments`) report; if a metric has no data it shows ₹0 / "N/A".

All scoping reuses the existing `useReportScope` hook (admins see all users, others see self + subordinates).

## Technical notes

- New components under `src/components/analytics/`: `AnalyticsShell.tsx` (tab bar + banners), `OverviewTab.tsx` (banners + KPI strip + SummaryByUser), `SummaryByUserChart.tsx` (pie/bar toggle, Top5/Bottom5).
- The six module tabs reuse the existing `src/components/reports/*Report.tsx` components and `reportPdf.ts` — no duplicate query logic.
- Styling uses existing semantic tokens only (`gradient-hero`, `shadow-card`, primary, gold border) — no hardcoded colors; charts via `recharts` (already a dependency).
- No database or schema changes required.
