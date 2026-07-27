-- External backup schema, phase 2, for the Bharath Builders project.
-- Run this ONCE in the EXTERNAL Supabase project (ylvhhlykyojudldcmzou)
-- via its SQL editor. It is additive: it does NOT touch the six tables
-- created by docs/external-backup-schema.sql.
--
-- Adds builders_* mirrors for GPS tracking, the Activity module, Sites and
-- all procurement_* tables. Primary keys match the source, so upserts
-- (Prefer: resolution=merge-duplicates) are idempotent. Safe to re-run.
--
-- RLS is enabled with NO policies, so only the service-role key (used by the
-- backup-mirror edge function) can read or write these tables.

-- --------------------------------------------- activity_events
create table if not exists public.builders_activity_events (
  id uuid primary key,
  user_id uuid,
  activity_type text,
  activity_name text,
  activity_date date,
  duration_type text,
  start_time timestamptz,
  end_time timestamptz,
  from_date date,
  to_date date,
  total_days numeric,
  half_day_type text,
  remarks text,
  retailer_id uuid,
  visit_id uuid,
  created_at timestamptz,
  description text,
  "status" text,
  project_id uuid,
  location_lat numeric,
  location_lng numeric,
  location_address text,
  attachment_urls jsonb,
  total_hours numeric,
  site_id uuid,
  status_changed_at timestamptz,
  status_change_lat numeric,
  status_change_lng numeric,
  milestone_id uuid,
  status_history jsonb,
  photo_urls jsonb,
  activity_code text,
  grn_po_id uuid,
  assigned_user_ids jsonb,
  source_form text
);

alter table public.builders_activity_events add column if not exists user_id uuid;
alter table public.builders_activity_events add column if not exists activity_type text;
alter table public.builders_activity_events add column if not exists activity_name text;
alter table public.builders_activity_events add column if not exists activity_date date;
alter table public.builders_activity_events add column if not exists duration_type text;
alter table public.builders_activity_events add column if not exists start_time timestamptz;
alter table public.builders_activity_events add column if not exists end_time timestamptz;
alter table public.builders_activity_events add column if not exists from_date date;
alter table public.builders_activity_events add column if not exists to_date date;
alter table public.builders_activity_events add column if not exists total_days numeric;
alter table public.builders_activity_events add column if not exists half_day_type text;
alter table public.builders_activity_events add column if not exists remarks text;
alter table public.builders_activity_events add column if not exists retailer_id uuid;
alter table public.builders_activity_events add column if not exists visit_id uuid;
alter table public.builders_activity_events add column if not exists created_at timestamptz;
alter table public.builders_activity_events add column if not exists description text;
alter table public.builders_activity_events add column if not exists "status" text;
alter table public.builders_activity_events add column if not exists project_id uuid;
alter table public.builders_activity_events add column if not exists location_lat numeric;
alter table public.builders_activity_events add column if not exists location_lng numeric;
alter table public.builders_activity_events add column if not exists location_address text;
alter table public.builders_activity_events add column if not exists attachment_urls jsonb;
alter table public.builders_activity_events add column if not exists total_hours numeric;
alter table public.builders_activity_events add column if not exists site_id uuid;
alter table public.builders_activity_events add column if not exists status_changed_at timestamptz;
alter table public.builders_activity_events add column if not exists status_change_lat numeric;
alter table public.builders_activity_events add column if not exists status_change_lng numeric;
alter table public.builders_activity_events add column if not exists milestone_id uuid;
alter table public.builders_activity_events add column if not exists status_history jsonb;
alter table public.builders_activity_events add column if not exists photo_urls jsonb;
alter table public.builders_activity_events add column if not exists activity_code text;
alter table public.builders_activity_events add column if not exists grn_po_id uuid;
alter table public.builders_activity_events add column if not exists assigned_user_ids jsonb;
alter table public.builders_activity_events add column if not exists source_form text;

-- --------------------------------------- activity_types_master
create table if not exists public.builders_activity_types_master (
  id uuid primary key,
  "name" text,
  is_active boolean,
  created_by uuid,
  created_at timestamptz,
  sort_order integer,
  details text
);

alter table public.builders_activity_types_master add column if not exists "name" text;
alter table public.builders_activity_types_master add column if not exists is_active boolean;
alter table public.builders_activity_types_master add column if not exists created_by uuid;
alter table public.builders_activity_types_master add column if not exists created_at timestamptz;
alter table public.builders_activity_types_master add column if not exists sort_order integer;
alter table public.builders_activity_types_master add column if not exists details text;

-- ------------------------------------------------ gps_tracking
create table if not exists public.builders_gps_tracking (
  id uuid primary key,
  user_id uuid,
  latitude numeric,
  longitude numeric,
  accuracy numeric,
  "timestamp" timestamptz,
  "date" date,
  speed numeric,
  heading numeric
);

alter table public.builders_gps_tracking add column if not exists user_id uuid;
alter table public.builders_gps_tracking add column if not exists latitude numeric;
alter table public.builders_gps_tracking add column if not exists longitude numeric;
alter table public.builders_gps_tracking add column if not exists accuracy numeric;
alter table public.builders_gps_tracking add column if not exists "timestamp" timestamptz;
alter table public.builders_gps_tracking add column if not exists "date" date;
alter table public.builders_gps_tracking add column if not exists speed numeric;
alter table public.builders_gps_tracking add column if not exists heading numeric;

-- ------------------------------------------ gps_tracking_stops
create table if not exists public.builders_gps_tracking_stops (
  id uuid primary key,
  user_id uuid,
  latitude numeric,
  longitude numeric,
  reason text,
  duration_minutes integer,
  "timestamp" timestamptz
);

alter table public.builders_gps_tracking_stops add column if not exists user_id uuid;
alter table public.builders_gps_tracking_stops add column if not exists latitude numeric;
alter table public.builders_gps_tracking_stops add column if not exists longitude numeric;
alter table public.builders_gps_tracking_stops add column if not exists reason text;
alter table public.builders_gps_tracking_stops add column if not exists duration_minutes integer;
alter table public.builders_gps_tracking_stops add column if not exists "timestamp" timestamptz;

-- ------------------------------------- procurement_attachments
create table if not exists public.builders_procurement_attachments (
  id uuid primary key,
  po_id uuid,
  vendor_id uuid,
  scope text,
  file_name text,
  file_path text,
  file_size bigint,
  content_type text,
  salesforce_id text,
  source text,
  created_by uuid,
  created_at timestamptz
);

alter table public.builders_procurement_attachments add column if not exists po_id uuid;
alter table public.builders_procurement_attachments add column if not exists vendor_id uuid;
alter table public.builders_procurement_attachments add column if not exists scope text;
alter table public.builders_procurement_attachments add column if not exists file_name text;
alter table public.builders_procurement_attachments add column if not exists file_path text;
alter table public.builders_procurement_attachments add column if not exists file_size bigint;
alter table public.builders_procurement_attachments add column if not exists content_type text;
alter table public.builders_procurement_attachments add column if not exists salesforce_id text;
alter table public.builders_procurement_attachments add column if not exists source text;
alter table public.builders_procurement_attachments add column if not exists created_by uuid;
alter table public.builders_procurement_attachments add column if not exists created_at timestamptz;

-- --------------------------------------- procurement_grn_items
create table if not exists public.builders_procurement_grn_items (
  id uuid primary key,
  grn_id uuid,
  procurement_item_id uuid,
  product_id uuid,
  ordered_qty numeric,
  received_qty numeric,
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.builders_procurement_grn_items add column if not exists grn_id uuid;
alter table public.builders_procurement_grn_items add column if not exists procurement_item_id uuid;
alter table public.builders_procurement_grn_items add column if not exists product_id uuid;
alter table public.builders_procurement_grn_items add column if not exists ordered_qty numeric;
alter table public.builders_procurement_grn_items add column if not exists received_qty numeric;
alter table public.builders_procurement_grn_items add column if not exists created_at timestamptz;
alter table public.builders_procurement_grn_items add column if not exists updated_at timestamptz;

-- -------------------------------------------- procurement_grns
create table if not exists public.builders_procurement_grns (
  id uuid primary key,
  po_id uuid,
  grn_number text,
  receipt_date date,
  received_by text,
  "status" text,
  remarks text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  photos jsonb,
  vendor_id uuid
);

alter table public.builders_procurement_grns add column if not exists po_id uuid;
alter table public.builders_procurement_grns add column if not exists grn_number text;
alter table public.builders_procurement_grns add column if not exists receipt_date date;
alter table public.builders_procurement_grns add column if not exists received_by text;
alter table public.builders_procurement_grns add column if not exists "status" text;
alter table public.builders_procurement_grns add column if not exists remarks text;
alter table public.builders_procurement_grns add column if not exists created_by uuid;
alter table public.builders_procurement_grns add column if not exists created_at timestamptz;
alter table public.builders_procurement_grns add column if not exists updated_at timestamptz;
alter table public.builders_procurement_grns add column if not exists photos jsonb;
alter table public.builders_procurement_grns add column if not exists vendor_id uuid;

-- ------------------------------------- procurement_import_runs
create table if not exists public.builders_procurement_import_runs (
  id uuid primary key,
  requested_from date,
  requested_to date,
  started_at timestamptz,
  finished_at timestamptz,
  "total" integer,
  created integer,
  updated integer,
  failed integer,
  summary jsonb,
  triggered_by uuid
);

alter table public.builders_procurement_import_runs add column if not exists requested_from date;
alter table public.builders_procurement_import_runs add column if not exists requested_to date;
alter table public.builders_procurement_import_runs add column if not exists started_at timestamptz;
alter table public.builders_procurement_import_runs add column if not exists finished_at timestamptz;
alter table public.builders_procurement_import_runs add column if not exists "total" integer;
alter table public.builders_procurement_import_runs add column if not exists created integer;
alter table public.builders_procurement_import_runs add column if not exists updated integer;
alter table public.builders_procurement_import_runs add column if not exists failed integer;
alter table public.builders_procurement_import_runs add column if not exists summary jsonb;
alter table public.builders_procurement_import_runs add column if not exists triggered_by uuid;

-- ----------------------------- procurement_invoice_attachments
create table if not exists public.builders_procurement_invoice_attachments (
  id uuid primary key,
  invoice_id uuid,
  file_name text,
  file_size bigint,
  file_path text,
  created_by uuid,
  created_at timestamptz,
  salesforce_id text
);

alter table public.builders_procurement_invoice_attachments add column if not exists invoice_id uuid;
alter table public.builders_procurement_invoice_attachments add column if not exists file_name text;
alter table public.builders_procurement_invoice_attachments add column if not exists file_size bigint;
alter table public.builders_procurement_invoice_attachments add column if not exists file_path text;
alter table public.builders_procurement_invoice_attachments add column if not exists created_by uuid;
alter table public.builders_procurement_invoice_attachments add column if not exists created_at timestamptz;
alter table public.builders_procurement_invoice_attachments add column if not exists salesforce_id text;

-- ----------------------------------- procurement_invoice_items
create table if not exists public.builders_procurement_invoice_items (
  id uuid primary key,
  invoice_id uuid,
  procurement_item_id uuid,
  product_id uuid,
  invoiced_rate numeric,
  invoiced_qty numeric,
  created_at timestamptz
);

alter table public.builders_procurement_invoice_items add column if not exists invoice_id uuid;
alter table public.builders_procurement_invoice_items add column if not exists procurement_item_id uuid;
alter table public.builders_procurement_invoice_items add column if not exists product_id uuid;
alter table public.builders_procurement_invoice_items add column if not exists invoiced_rate numeric;
alter table public.builders_procurement_invoice_items add column if not exists invoiced_qty numeric;
alter table public.builders_procurement_invoice_items add column if not exists created_at timestamptz;

-- -------------------------------- procurement_invoice_payments
create table if not exists public.builders_procurement_invoice_payments (
  id uuid primary key,
  invoice_id uuid,
  reference_number text,
  bank_name text,
  amount numeric,
  payment_date date,
  created_by uuid,
  created_at timestamptz,
  "notes" text,
  salesforce_id text
);

alter table public.builders_procurement_invoice_payments add column if not exists invoice_id uuid;
alter table public.builders_procurement_invoice_payments add column if not exists reference_number text;
alter table public.builders_procurement_invoice_payments add column if not exists bank_name text;
alter table public.builders_procurement_invoice_payments add column if not exists amount numeric;
alter table public.builders_procurement_invoice_payments add column if not exists payment_date date;
alter table public.builders_procurement_invoice_payments add column if not exists created_by uuid;
alter table public.builders_procurement_invoice_payments add column if not exists created_at timestamptz;
alter table public.builders_procurement_invoice_payments add column if not exists "notes" text;
alter table public.builders_procurement_invoice_payments add column if not exists salesforce_id text;

-- ---------------------------------------- procurement_invoices
create table if not exists public.builders_procurement_invoices (
  id uuid primary key,
  po_id uuid,
  invoice_number text,
  invoice_date date,
  invoice_amount numeric,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  vendor_id uuid,
  salesforce_id text
);

alter table public.builders_procurement_invoices add column if not exists po_id uuid;
alter table public.builders_procurement_invoices add column if not exists invoice_number text;
alter table public.builders_procurement_invoices add column if not exists invoice_date date;
alter table public.builders_procurement_invoices add column if not exists invoice_amount numeric;
alter table public.builders_procurement_invoices add column if not exists created_by uuid;
alter table public.builders_procurement_invoices add column if not exists created_at timestamptz;
alter table public.builders_procurement_invoices add column if not exists updated_at timestamptz;
alter table public.builders_procurement_invoices add column if not exists vendor_id uuid;
alter table public.builders_procurement_invoices add column if not exists salesforce_id text;

-- ------------------------------------------- procurement_items
create table if not exists public.builders_procurement_items (
  id uuid primary key,
  procurement_id uuid,
  product_id uuid,
  rate numeric,
  qty numeric,
  amount numeric,
  created_at timestamptz,
  updated_at timestamptz,
  uom text,
  vendor_ids uuid[],
  rate_source text,
  rate_source_vendor_id uuid,
  salesforce_id text
);

alter table public.builders_procurement_items add column if not exists procurement_id uuid;
alter table public.builders_procurement_items add column if not exists product_id uuid;
alter table public.builders_procurement_items add column if not exists rate numeric;
alter table public.builders_procurement_items add column if not exists qty numeric;
alter table public.builders_procurement_items add column if not exists amount numeric;
alter table public.builders_procurement_items add column if not exists created_at timestamptz;
alter table public.builders_procurement_items add column if not exists updated_at timestamptz;
alter table public.builders_procurement_items add column if not exists uom text;
alter table public.builders_procurement_items add column if not exists vendor_ids uuid[];
alter table public.builders_procurement_items add column if not exists rate_source text;
alter table public.builders_procurement_items add column if not exists rate_source_vendor_id uuid;
alter table public.builders_procurement_items add column if not exists salesforce_id text;

-- ------------------------------------------ procurement_orders
create table if not exists public.builders_procurement_orders (
  id uuid primary key,
  order_date date,
  vendor_id uuid,
  po_number text,
  site_id uuid,
  entity_id uuid,
  "status" text,
  grn_number text,
  grn_status text,
  total_amount numeric,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  expected_delivery_date date,
  payment_terms text,
  estimated_budget numeric,
  bill_to text,
  ship_to text,
  vendor_ids uuid[],
  requisition_notes text,
  bill_to_address_id text,
  ship_to_address_id text,
  bill_to_gst text,
  ship_to_gst text,
  source_type text,
  transfer_from_site_id uuid,
  stage_history jsonb,
  requisition_name text,
  terms_and_conditions jsonb,
  requisition_number text,
  salesforce_id text
);

alter table public.builders_procurement_orders add column if not exists order_date date;
alter table public.builders_procurement_orders add column if not exists vendor_id uuid;
alter table public.builders_procurement_orders add column if not exists po_number text;
alter table public.builders_procurement_orders add column if not exists site_id uuid;
alter table public.builders_procurement_orders add column if not exists entity_id uuid;
alter table public.builders_procurement_orders add column if not exists "status" text;
alter table public.builders_procurement_orders add column if not exists grn_number text;
alter table public.builders_procurement_orders add column if not exists grn_status text;
alter table public.builders_procurement_orders add column if not exists total_amount numeric;
alter table public.builders_procurement_orders add column if not exists created_by uuid;
alter table public.builders_procurement_orders add column if not exists created_at timestamptz;
alter table public.builders_procurement_orders add column if not exists updated_at timestamptz;
alter table public.builders_procurement_orders add column if not exists expected_delivery_date date;
alter table public.builders_procurement_orders add column if not exists payment_terms text;
alter table public.builders_procurement_orders add column if not exists estimated_budget numeric;
alter table public.builders_procurement_orders add column if not exists bill_to text;
alter table public.builders_procurement_orders add column if not exists ship_to text;
alter table public.builders_procurement_orders add column if not exists vendor_ids uuid[];
alter table public.builders_procurement_orders add column if not exists requisition_notes text;
alter table public.builders_procurement_orders add column if not exists bill_to_address_id text;
alter table public.builders_procurement_orders add column if not exists ship_to_address_id text;
alter table public.builders_procurement_orders add column if not exists bill_to_gst text;
alter table public.builders_procurement_orders add column if not exists ship_to_gst text;
alter table public.builders_procurement_orders add column if not exists source_type text;
alter table public.builders_procurement_orders add column if not exists transfer_from_site_id uuid;
alter table public.builders_procurement_orders add column if not exists stage_history jsonb;
alter table public.builders_procurement_orders add column if not exists requisition_name text;
alter table public.builders_procurement_orders add column if not exists terms_and_conditions jsonb;
alter table public.builders_procurement_orders add column if not exists requisition_number text;
alter table public.builders_procurement_orders add column if not exists salesforce_id text;

-- --------------------------------- procurement_vendor_feedback
create table if not exists public.builders_procurement_vendor_feedback (
  id uuid primary key,
  grn_id uuid,
  vendor_id uuid,
  po_id uuid,
  delivery_timeliness integer,
  material_quality integer,
  quantity_accuracy integer,
  overall_experience integer,
  comments text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.builders_procurement_vendor_feedback add column if not exists grn_id uuid;
alter table public.builders_procurement_vendor_feedback add column if not exists vendor_id uuid;
alter table public.builders_procurement_vendor_feedback add column if not exists po_id uuid;
alter table public.builders_procurement_vendor_feedback add column if not exists delivery_timeliness integer;
alter table public.builders_procurement_vendor_feedback add column if not exists material_quality integer;
alter table public.builders_procurement_vendor_feedback add column if not exists quantity_accuracy integer;
alter table public.builders_procurement_vendor_feedback add column if not exists overall_experience integer;
alter table public.builders_procurement_vendor_feedback add column if not exists comments text;
alter table public.builders_procurement_vendor_feedback add column if not exists created_by uuid;
alter table public.builders_procurement_vendor_feedback add column if not exists created_at timestamptz;
alter table public.builders_procurement_vendor_feedback add column if not exists updated_at timestamptz;

-- ------------------------------ procurement_vendor_quote_items
create table if not exists public.builders_procurement_vendor_quote_items (
  id uuid primary key,
  quote_id uuid,
  procurement_item_id uuid,
  rate numeric,
  discount_pct numeric,
  rate_after_discount numeric,
  delivery_commitment_date date,
  is_selected boolean,
  created_at timestamptz,
  updated_at timestamptz,
  quality_notes text,
  salesforce_id text
);

alter table public.builders_procurement_vendor_quote_items add column if not exists quote_id uuid;
alter table public.builders_procurement_vendor_quote_items add column if not exists procurement_item_id uuid;
alter table public.builders_procurement_vendor_quote_items add column if not exists rate numeric;
alter table public.builders_procurement_vendor_quote_items add column if not exists discount_pct numeric;
alter table public.builders_procurement_vendor_quote_items add column if not exists rate_after_discount numeric;
alter table public.builders_procurement_vendor_quote_items add column if not exists delivery_commitment_date date;
alter table public.builders_procurement_vendor_quote_items add column if not exists is_selected boolean;
alter table public.builders_procurement_vendor_quote_items add column if not exists created_at timestamptz;
alter table public.builders_procurement_vendor_quote_items add column if not exists updated_at timestamptz;
alter table public.builders_procurement_vendor_quote_items add column if not exists quality_notes text;
alter table public.builders_procurement_vendor_quote_items add column if not exists salesforce_id text;

-- ----------------------------------- procurement_vendor_quotes
create table if not exists public.builders_procurement_vendor_quotes (
  id uuid primary key,
  po_id uuid,
  vendor_id uuid,
  token text,
  "status" text,
  vendor_payment_term text,
  "notes" text,
  submitted_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  procurement_item_ids uuid[],
  change_request_notes text,
  attachments jsonb,
  terms_accepted_at timestamptz,
  first_submitted_at timestamptz,
  last_resubmitted_at timestamptz,
  reopened_at timestamptz,
  reopened_by uuid,
  term_responses jsonb,
  version integer,
  is_latest boolean,
  salesforce_id text
);

alter table public.builders_procurement_vendor_quotes add column if not exists po_id uuid;
alter table public.builders_procurement_vendor_quotes add column if not exists vendor_id uuid;
alter table public.builders_procurement_vendor_quotes add column if not exists token text;
alter table public.builders_procurement_vendor_quotes add column if not exists "status" text;
alter table public.builders_procurement_vendor_quotes add column if not exists vendor_payment_term text;
alter table public.builders_procurement_vendor_quotes add column if not exists "notes" text;
alter table public.builders_procurement_vendor_quotes add column if not exists submitted_at timestamptz;
alter table public.builders_procurement_vendor_quotes add column if not exists created_by uuid;
alter table public.builders_procurement_vendor_quotes add column if not exists created_at timestamptz;
alter table public.builders_procurement_vendor_quotes add column if not exists updated_at timestamptz;
alter table public.builders_procurement_vendor_quotes add column if not exists procurement_item_ids uuid[];
alter table public.builders_procurement_vendor_quotes add column if not exists change_request_notes text;
alter table public.builders_procurement_vendor_quotes add column if not exists attachments jsonb;
alter table public.builders_procurement_vendor_quotes add column if not exists terms_accepted_at timestamptz;
alter table public.builders_procurement_vendor_quotes add column if not exists first_submitted_at timestamptz;
alter table public.builders_procurement_vendor_quotes add column if not exists last_resubmitted_at timestamptz;
alter table public.builders_procurement_vendor_quotes add column if not exists reopened_at timestamptz;
alter table public.builders_procurement_vendor_quotes add column if not exists reopened_by uuid;
alter table public.builders_procurement_vendor_quotes add column if not exists term_responses jsonb;
alter table public.builders_procurement_vendor_quotes add column if not exists version integer;
alter table public.builders_procurement_vendor_quotes add column if not exists is_latest boolean;
alter table public.builders_procurement_vendor_quotes add column if not exists salesforce_id text;

-- ----------------------------------------------- project_sites
create table if not exists public.builders_project_sites (
  id uuid primary key,
  site_name text,
  site_code text,
  description text,
  is_active boolean,
  deleted_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  start_date date,
  end_date date,
  flag text,
  "status" text,
  attachment_urls text[],
  image_url text
);

alter table public.builders_project_sites add column if not exists site_name text;
alter table public.builders_project_sites add column if not exists site_code text;
alter table public.builders_project_sites add column if not exists description text;
alter table public.builders_project_sites add column if not exists is_active boolean;
alter table public.builders_project_sites add column if not exists deleted_at timestamptz;
alter table public.builders_project_sites add column if not exists created_by uuid;
alter table public.builders_project_sites add column if not exists created_at timestamptz;
alter table public.builders_project_sites add column if not exists updated_at timestamptz;
alter table public.builders_project_sites add column if not exists start_date date;
alter table public.builders_project_sites add column if not exists end_date date;
alter table public.builders_project_sites add column if not exists flag text;
alter table public.builders_project_sites add column if not exists "status" text;
alter table public.builders_project_sites add column if not exists attachment_urls text[];
alter table public.builders_project_sites add column if not exists image_url text;

-- -------------------------------------------- site_assignments
create table if not exists public.builders_site_assignments (
  id uuid primary key,
  site_id uuid,
  user_id uuid,
  assigned_at timestamptz,
  assigned_by uuid
);

alter table public.builders_site_assignments add column if not exists site_id uuid;
alter table public.builders_site_assignments add column if not exists user_id uuid;
alter table public.builders_site_assignments add column if not exists assigned_at timestamptz;
alter table public.builders_site_assignments add column if not exists assigned_by uuid;

-- -------------------------------------------------- site_files
create table if not exists public.builders_site_files (
  id uuid primary key,
  site_id uuid,
  kind text,
  storage_key text,
  file_name text,
  file_size bigint,
  mime_type text,
  uploaded_by uuid,
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.builders_site_files add column if not exists site_id uuid;
alter table public.builders_site_files add column if not exists kind text;
alter table public.builders_site_files add column if not exists storage_key text;
alter table public.builders_site_files add column if not exists file_name text;
alter table public.builders_site_files add column if not exists file_size bigint;
alter table public.builders_site_files add column if not exists mime_type text;
alter table public.builders_site_files add column if not exists uploaded_by uuid;
alter table public.builders_site_files add column if not exists created_at timestamptz;
alter table public.builders_site_files add column if not exists updated_at timestamptz;

-- ------------------------------------- site_milestone_comments
create table if not exists public.builders_site_milestone_comments (
  id uuid primary key,
  milestone_id uuid,
  user_id uuid,
  content text,
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.builders_site_milestone_comments add column if not exists milestone_id uuid;
alter table public.builders_site_milestone_comments add column if not exists user_id uuid;
alter table public.builders_site_milestone_comments add column if not exists content text;
alter table public.builders_site_milestone_comments add column if not exists created_at timestamptz;
alter table public.builders_site_milestone_comments add column if not exists updated_at timestamptz;

-- --------------------------------------------- site_milestones
create table if not exists public.builders_site_milestones (
  id uuid primary key,
  site_id uuid,
  "name" text,
  start_date date,
  end_date date,
  "status" text,
  priority text,
  created_at timestamptz,
  updated_at timestamptz,
  actual_start_date date,
  actual_end_date date,
  percent_complete integer,
  "notes" text,
  is_active boolean,
  at_risk boolean,
  parent_id uuid
);

alter table public.builders_site_milestones add column if not exists site_id uuid;
alter table public.builders_site_milestones add column if not exists "name" text;
alter table public.builders_site_milestones add column if not exists start_date date;
alter table public.builders_site_milestones add column if not exists end_date date;
alter table public.builders_site_milestones add column if not exists "status" text;
alter table public.builders_site_milestones add column if not exists priority text;
alter table public.builders_site_milestones add column if not exists created_at timestamptz;
alter table public.builders_site_milestones add column if not exists updated_at timestamptz;
alter table public.builders_site_milestones add column if not exists actual_start_date date;
alter table public.builders_site_milestones add column if not exists actual_end_date date;
alter table public.builders_site_milestones add column if not exists percent_complete integer;
alter table public.builders_site_milestones add column if not exists "notes" text;
alter table public.builders_site_milestones add column if not exists is_active boolean;
alter table public.builders_site_milestones add column if not exists at_risk boolean;
alter table public.builders_site_milestones add column if not exists parent_id uuid;

-- --------------------------------------------------------- lock it down
alter table public.builders_activity_events enable row level security;
alter table public.builders_activity_types_master enable row level security;
alter table public.builders_gps_tracking enable row level security;
alter table public.builders_gps_tracking_stops enable row level security;
alter table public.builders_procurement_attachments enable row level security;
alter table public.builders_procurement_grn_items enable row level security;
alter table public.builders_procurement_grns enable row level security;
alter table public.builders_procurement_import_runs enable row level security;
alter table public.builders_procurement_invoice_attachments enable row level security;
alter table public.builders_procurement_invoice_items enable row level security;
alter table public.builders_procurement_invoice_payments enable row level security;
alter table public.builders_procurement_invoices enable row level security;
alter table public.builders_procurement_items enable row level security;
alter table public.builders_procurement_orders enable row level security;
alter table public.builders_procurement_vendor_feedback enable row level security;
alter table public.builders_procurement_vendor_quote_items enable row level security;
alter table public.builders_procurement_vendor_quotes enable row level security;
alter table public.builders_project_sites enable row level security;
alter table public.builders_site_assignments enable row level security;
alter table public.builders_site_files enable row level security;
alter table public.builders_site_milestone_comments enable row level security;
alter table public.builders_site_milestones enable row level security;

grant all on public.builders_activity_events to service_role;
grant all on public.builders_activity_types_master to service_role;
grant all on public.builders_gps_tracking to service_role;
grant all on public.builders_gps_tracking_stops to service_role;
grant all on public.builders_procurement_attachments to service_role;
grant all on public.builders_procurement_grn_items to service_role;
grant all on public.builders_procurement_grns to service_role;
grant all on public.builders_procurement_import_runs to service_role;
grant all on public.builders_procurement_invoice_attachments to service_role;
grant all on public.builders_procurement_invoice_items to service_role;
grant all on public.builders_procurement_invoice_payments to service_role;
grant all on public.builders_procurement_invoices to service_role;
grant all on public.builders_procurement_items to service_role;
grant all on public.builders_procurement_orders to service_role;
grant all on public.builders_procurement_vendor_feedback to service_role;
grant all on public.builders_procurement_vendor_quote_items to service_role;
grant all on public.builders_procurement_vendor_quotes to service_role;
grant all on public.builders_project_sites to service_role;
grant all on public.builders_site_assignments to service_role;
grant all on public.builders_site_files to service_role;
grant all on public.builders_site_milestone_comments to service_role;
grant all on public.builders_site_milestones to service_role;

create index if not exists idx_builders_gps_tracking_user_date on public.builders_gps_tracking (user_id, "date");
create index if not exists idx_builders_activity_events_user_date on public.builders_activity_events (user_id, activity_date);
create index if not exists idx_builders_procurement_items_po on public.builders_procurement_items (procurement_id);
