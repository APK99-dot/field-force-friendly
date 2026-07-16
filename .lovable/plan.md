## Scope

Faithfully port 4 CRM modules — **Customers, Leads, Events, Opportunities** — from `Jovo Automation` (project `eb4a3a70…`) into this project. Purely additive; existing modules (Attendance, GPS, Procurement, Activities, Milestones, Expenses, Reports, Admin, Security, Master Data) are untouched except for minimal nav additions.

## Database (new tables in this project)

All in `public`, RLS enabled, GRANT to `authenticated` + `service_role` (Procurement pattern — authenticated users can read/write; admin-managed via existing roles).

**CRM data**
- `customers` (name, industry, status, owner_id, primary_contact_id)
- `customer_contacts` (customer_id, name, title, email, phone, reports_to_id, last_contact_at)
- `customer_activities` (customer_id, opportunity_id, lead_id, type, subject, notes, activity_date, created_by)
- `customer_documents` (customer_id, opportunity_id, file_name, file_url, file_size, file_type, uploaded_by)
- `customer_opportunities` (customer_id, name, type, stage, probability, close_date, amount, owner_id, currency, payment_terms, opportunity_source_id, requirements_highlights, budget_status, authority_role, need_level, timeline, primary_contact_id, stage_changed_at)
- `opportunity_milestones` (opportunity_id, name, invoice_number, invoice_date, invoice_value, status)
- `opportunity_quotes` (opportunity_id, name, notes, total, overall_discount_pct, is_synced)
- `opportunity_quote_items` (quote_id, product_id, product_name, qty, unit_price, start_date, end_date, term_months, discount_pct, total, sort_order)
- `leads` (all fields from LeadRow — owner, contact info, statuses, SLA dates, conversion tracking, business_card_url)
- `lead_audit_log` (lead_id, actor_id, event_type, from_value, to_value, notes)
- `events` (name, event_type_id, budget/actual amount, start/end date, details, expected_end_result, owner_id, customer_id)

**CRM master data** (net-new, alongside existing masters — not merged)
- `master_lead_sources` (name, sort_order, is_active)
- `master_lead_statuses` (name, color, is_converted_status, sort_order, is_active)
- `master_event_types` (name, sort_order, is_active)
- `opportunity_stages` (name, color, sort_order, is_won, is_closed, is_active)
- `opportunity_types` (name, sort_order, is_active)

**RPC**: `convert_lead(_lead_id uuid, _payload jsonb)` — mirrors source (creates customer, primary contact, marks lead converted, logs audit).

**Storage bucket**: `customer-documents` (private, RLS to authenticated).

Scoring rules stored in existing `app_configuration` under `module='lead_scoring'` / `module='opportunity_scoring'` — no schema changes needed there.

## Frontend files copied (verbatim where possible, adapted only for imports/nav)

**Pages** (`src/pages/`): Customers.tsx, CustomerDetail.tsx, Leads.tsx, LeadDetail.tsx, Events.tsx, EventDetail.tsx, Opportunities.tsx, OpportunityDetail.tsx

**Master pages** (`src/pages/master/`): LeadSourcesMaster.tsx, LeadStatusesMaster.tsx, EventTypesMaster.tsx, OpportunityStagesMaster.tsx, OpportunityTypesMaster.tsx, LeadScoringMaster.tsx, OpportunityScoringMaster.tsx

**Components** (`src/components/customers/`, `src/components/leads/`): all 9 customer + 6 lead components as listed.

**Hooks** (`src/hooks/`): useCustomers.ts, useLeadsEvents.ts, useLeadScoring.ts, useOpportunityMasters.ts, useOpportunityScoring.ts

Full features retained: lead scoring, BANT, deal health, SLA tab, business-card scanner (uses existing Lovable AI gateway), convert-lead flow, contact org chart, quotes + line items, milestones with invoicing.

## Minimal shared-file changes (nav only)

- `src/App.tsx`: add 8 new lazy routes (`/customers`, `/customers/:id`, `/leads`, `/leads/:id`, `/events`, `/events/:id`, `/opportunities`, `/opportunities/:id`) + 7 master routes. No other route changes.
- `src/pages/MasterData.tsx`: append 5 new master-data cards (Lead Sources, Lead Statuses, Event Types, Opportunity Stages, Opportunity Types). Existing cards unchanged.
- `src/config/appModules.ts`: add `module_crm` entry (or 4 separate module keys, matching source's pattern) for permission gating.
- Side navigation (`AppHeader` drawer): add 4 nav items — Customers, Leads, Events, Opportunities — gated by the new module key(s). No reordering of existing items.

No changes to BottomNav, Dashboard, Procurement, Activities, or any other page.

## Assumptions (flag if wrong)

1. **RLS**: use the Procurement/Activities pattern — any authenticated user can read/write CRM records; no per-user ownership restriction. If you want stricter (owner-only edit), say so.
2. **Nav gating**: single new `module_crm` permission covering all 4 pages, mirroring how "module_procurement" gates all procurement UI. Alternative: 4 separate module keys.
3. **Business-card scanner** in source likely uses Lovable AI Gateway (`LOVABLE_API_KEY`) — will reuse the same edge function pattern; no external OCR key needed.
4. **Convert-lead RPC** will be recreated here with the source's logic (I'll read the source migration/function before writing).
5. **Currency/Payment Terms masters** — source references `master_currencies` and `master_payment_terms`; you said do NOT duplicate existing masters. This project has none, so opportunities/quotes need a currency source. Plan: hardcode INR default + reuse existing procurement `payment_terms` text field (freeform) instead of creating currency/payment-term master tables. Confirm or override.

## Execution order

1. Migration: all tables + RLS + GRANTs + `convert_lead` RPC + storage bucket + seed default lead statuses/sources/event types/opportunity stages/types.
2. Copy hooks (5 files).
3. Copy components (15 files).
4. Copy pages (15 files — 8 CRM + 7 master).
5. Wire routes in `App.tsx`, add cards in `MasterData.tsx`, add nav items in `AppHeader`, register module in `appModules.ts`.
6. Copy business-card scanner edge function if present.
7. Typecheck + smoke-check preview.

Reply **go** to proceed, or flag the assumptions to adjust.