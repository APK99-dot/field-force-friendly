## Goal

Every weekday at 1:00 PM and 6:00 PM IST, copy rows from six critical tables in this project into `builders_*` tables in the external Supabase project (`ylvhhlykyojudldcmzou`), incrementally (only rows changed since the last successful run).

## Tables mirrored


| Source (this project)          | Destination (external)        | Change key                             |
| ------------------------------ | ----------------------------- | -------------------------------------- |
| `users` (10 cols)              | `builders_users`              | `updated_at`                           |
| `employees` (17 cols)          | `builders_employees`          | `updated_at`                           |
| `attendance` (21 cols)         | `builders_attendance`         | `updated_at`                           |
| `profiles` (13 cols)           | `builders_profiles`           | `updated_at`                           |
| `leave_applications` (16 cols) | `builders_leave_applications` | `updated_at`                           |
| `user_roles` (4 cols)          | `builders_user_roles`         | `assigned_at` (no `updated_at` column) |


Primary keys are carried over unchanged, so every push is an idempotent upsert (`Prefer: resolution=merge-duplicates`). Re-running a sync never duplicates rows.

## How it differs from Trayi

Trayi mirrors in real time: a Postgres trigger fires `pg_net` on every row write. Here you asked for a scheduled batch, so instead of per-row triggers we use a single pg_cron job that calls one edge function which pulls changed rows and pushes them in batches. Fewer moving parts, no write-path overhead, and one audit row per table per run.

## What gets built

1. **External schema script** — `docs/external-backup-schema.sql`, run once by you in the external project's SQL editor. Creates the six `builders_*` tables (matching column types, `id` as primary key, RLS enabled with no public policies so only the service key can read/write) and is safe to re-run.
2. **Secret** — `BACKUP_MIRROR_SERVICE_KEY`: the external project's service-role key, stored securely. I'll request it once the tables exist.
3. **Edge function** — `supabase/functions/backup-mirror/index.ts`:
  - Reads the last successful watermark per table from a local `backup_mirror_state` table.
  - Selects rows where the change key is greater than that watermark, ordered and paged at 500 rows per batch (keeps runs well under the function timeout even on a first full backfill).
  - Strips to an allowlist of columns per table, then upserts into `builders_<table>`.
  - Writes one row per table per run into `backup_mirror_audit` (trace id, row count, status, HTTP status, error text) and advances the watermark only on success — a failed table retries its full delta next run.
  - Supports `{"action":"backfill"}` for an admin-triggered first full copy and `{"action":"status"}` returning external row counts vs local counts.
4. **Local tables** (migration) — `backup_mirror_state` (table name, last synced timestamp) and `backup_mirror_audit` (run log), both service-role only.
5. **Cron job** — pg_cron + pg_net, schedule `30 12 * * 1-5` (UTC) = 6:00 PM IST and `30 07 * * 1-5` (UTC), Monday–Friday. Registered via a data statement so the function URL and key aren't baked into a shared migration.

## Operational notes

- **First run**: I'll trigger a manual backfill so the external tables start in sync; the nightly job then only carries deltas.
- **Failure visibility**: `backup_mirror_audit` shows every run. If a night fails, the next run picks up the same delta automatically — no data loss, just delay.
- **Holidays**: the job runs every Mon–Fri regardless of holidays; a no-change day simply pushes zero rows.
- **Direction**: strictly one-way (this project → external). Nothing is read back into the app.
- **Deleted rows**: an upsert mirror does not remove rows deleted in the source. Given this project blocks hard deletes (`prevent_client_hard_delete`) and uses deactivation instead, deactivated records mirror across correctly as updates.

## What I need from you

- Run the generated SQL script in the external project once.
- Provide the external project's service-role key when I request it.