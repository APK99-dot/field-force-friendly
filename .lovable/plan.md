
# Extend the backup mirror to GPS, Activity, Site and Procurement tables

Purely additive: the existing six mirrored tables, their watermarks, the edge function's sync logic, and the two cron jobs stay exactly as they are. No business logic, triggers, or app code is touched.

## Tables to add (21)

Verified against the live schema, with row counts and the change key each one can use.

**GPS**
| Table | Rows | Change key | Mode |
|---|---|---|---|
| gps_tracking | 355 | `timestamp` | incremental (append-only) |
| gps_tracking_stops | 0 | `timestamp` | incremental |

**Activity module**
| Table | Rows | Change key | Mode |
|---|---|---|---|
| activity_events | 21 | `created_at` | full refresh |
| activity_types_master | 10 | `created_at` | full refresh |

**Sites**
| Table | Rows | Change key | Mode |
|---|---|---|---|
| project_sites | 4 | `updated_at` | incremental |
| site_milestones | 8 | `updated_at` | incremental |
| site_milestone_comments | 3 | `updated_at` | incremental |
| site_files | 1 | `updated_at` | incremental |
| site_assignments | 3 | `assigned_at` | full refresh |

**Procurement (all 13 `procurement_*` tables)**
| Table | Rows | Change key | Mode |
|---|---|---|---|
| procurement_orders | 30 | `updated_at` | incremental |
| procurement_items | 88 | `updated_at` | incremental |
| procurement_vendor_quotes | 48 | `updated_at` | incremental |
| procurement_vendor_quote_items | 82 | `updated_at` | incremental |
| procurement_vendor_feedback | 6 | `updated_at` | incremental |
| procurement_grns | 9 | `updated_at` | incremental |
| procurement_grn_items | 12 | `updated_at` | incremental |
| procurement_invoices | 18 | `updated_at` | incremental |
| procurement_invoice_items | 5 | `created_at` | full refresh |
| procurement_invoice_payments | 20 | `created_at` | full refresh |
| procurement_invoice_attachments | 0 | `created_at` | full refresh |
| procurement_attachments | 0 | `created_at` | full refresh |
| procurement_import_runs | 1 | `started_at` | full refresh |

### Why two modes
Several of these tables have no `updated_at` column, so a watermark on `created_at` would silently miss later edits (an activity's status change, for example, would never reach the mirror). Every such table is tiny (≤ 21 rows today), so they are marked **full refresh**: each run re-reads all rows and upserts them by primary key. Cost is negligible and correctness is guaranteed. Tables that do have `updated_at`, plus the append-only GPS tables, stay on the existing efficient watermark path.

## Work items

1. **New external-schema script** — `docs/external-backup-schema-phase2.sql`, same shape as the existing one: `create table if not exists public.builders_<name>` mirroring the source columns, `add column if not exists` guards, RLS enabled with no policies, `grant all ... to service_role`. You run this once in the external project's SQL editor. The original script is left untouched.

2. **Edge function `backup-mirror`** — extend the `TABLES` allowlist with the 21 entries above (explicit column allowlists, as today) and add an optional `mode: "full"` flag per spec. Full-refresh tables ignore the watermark and page through everything each run. Existing entries and the sync/audit/watermark machinery are unchanged.

3. **Cron** — no change needed. Both jobs already call the function with no table filter, so the new entries are picked up automatically on the 1:00 PM and 6:00 PM IST weekday runs.

4. **Backfill and verify** — after you confirm the SQL script has run, trigger a one-off `backfill`, then a `status` call comparing local vs external counts for all 27 tables.

## Notes

- Storage buckets (site photos, procurement attachments, activity photos) are **not** mirrored — only the database rows that reference them. Say the word if you want file mirroring too; that is a separate, larger piece of work.
- `gps_tracking` is the only table with meaningful growth. It is append-only and paged at 500 rows, so incremental runs stay cheap.
- Direction stays strictly one-way: this project → external project.

## Your one manual step

Run `docs/external-backup-schema-phase2.sql` in the external project's SQL editor once the file is created, then tell me and I will run the backfill and verification.
