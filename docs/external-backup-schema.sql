-- External backup schema for the Bharath Builders project.
-- Run this ONCE in the EXTERNAL Supabase project (ylvhhlykyojudldcmzou)
-- via its SQL editor.
--
-- These builders_* tables mirror rows from the main project. Primary keys
-- match the source, so upserts (Prefer: resolution=merge-duplicates) are
-- idempotent. This script is safe to re-run: it creates missing tables and
-- adds missing columns.
--
-- RLS is enabled with NO policies, so only the service-role key (used by the
-- backup-mirror edge function) can read or write these tables.

-- ---------------------------------------------------------------- users
create table if not exists public.builders_users (
  id uuid primary key,
  email text,
  full_name text,
  username text,
  role_id uuid,
  reporting_manager_id uuid,
  phone text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.builders_users add column if not exists email text;
alter table public.builders_users add column if not exists full_name text;
alter table public.builders_users add column if not exists username text;
alter table public.builders_users add column if not exists role_id uuid;
alter table public.builders_users add column if not exists reporting_manager_id uuid;
alter table public.builders_users add column if not exists phone text;
alter table public.builders_users add column if not exists is_active boolean;
alter table public.builders_users add column if not exists created_at timestamptz;
alter table public.builders_users add column if not exists updated_at timestamptz;

-- ------------------------------------------------------------ employees
create table if not exists public.builders_employees (
  id uuid primary key,
  user_id uuid,
  monthly_salary numeric,
  daily_da_allowance numeric,
  manager_id uuid,
  secondary_manager_id uuid,
  hq text,
  date_of_joining date,
  date_of_exit date,
  alternate_email text,
  address text,
  education text,
  emergency_contact_number text,
  photo_url text,
  band text,
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.builders_employees add column if not exists user_id uuid;
alter table public.builders_employees add column if not exists monthly_salary numeric;
alter table public.builders_employees add column if not exists daily_da_allowance numeric;
alter table public.builders_employees add column if not exists manager_id uuid;
alter table public.builders_employees add column if not exists secondary_manager_id uuid;
alter table public.builders_employees add column if not exists hq text;
alter table public.builders_employees add column if not exists date_of_joining date;
alter table public.builders_employees add column if not exists date_of_exit date;
alter table public.builders_employees add column if not exists alternate_email text;
alter table public.builders_employees add column if not exists address text;
alter table public.builders_employees add column if not exists education text;
alter table public.builders_employees add column if not exists emergency_contact_number text;
alter table public.builders_employees add column if not exists photo_url text;
alter table public.builders_employees add column if not exists band text;
alter table public.builders_employees add column if not exists created_at timestamptz;
alter table public.builders_employees add column if not exists updated_at timestamptz;

-- ----------------------------------------------------------- attendance
create table if not exists public.builders_attendance (
  id uuid primary key,
  user_id uuid,
  check_in_time timestamptz,
  check_out_time timestamptz,
  check_in_location jsonb,
  check_out_location jsonb,
  check_in_photo_url text,
  check_out_photo_url text,
  check_in_address text,
  check_out_address text,
  status text,
  total_hours numeric,
  date date,
  face_verification_status text,
  face_match_confidence numeric,
  face_verification_status_out text,
  face_match_confidence_out numeric,
  notes text,
  regularized_request_id uuid,
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.builders_attendance add column if not exists user_id uuid;
alter table public.builders_attendance add column if not exists check_in_time timestamptz;
alter table public.builders_attendance add column if not exists check_out_time timestamptz;
alter table public.builders_attendance add column if not exists check_in_location jsonb;
alter table public.builders_attendance add column if not exists check_out_location jsonb;
alter table public.builders_attendance add column if not exists check_in_photo_url text;
alter table public.builders_attendance add column if not exists check_out_photo_url text;
alter table public.builders_attendance add column if not exists check_in_address text;
alter table public.builders_attendance add column if not exists check_out_address text;
alter table public.builders_attendance add column if not exists status text;
alter table public.builders_attendance add column if not exists total_hours numeric;
alter table public.builders_attendance add column if not exists date date;
alter table public.builders_attendance add column if not exists face_verification_status text;
alter table public.builders_attendance add column if not exists face_match_confidence numeric;
alter table public.builders_attendance add column if not exists face_verification_status_out text;
alter table public.builders_attendance add column if not exists face_match_confidence_out numeric;
alter table public.builders_attendance add column if not exists notes text;
alter table public.builders_attendance add column if not exists regularized_request_id uuid;
alter table public.builders_attendance add column if not exists created_at timestamptz;
alter table public.builders_attendance add column if not exists updated_at timestamptz;

create index if not exists idx_builders_attendance_user_date
  on public.builders_attendance (user_id, date);

-- ------------------------------------------------------------- profiles
create table if not exists public.builders_profiles (
  id uuid primary key,
  username text,
  full_name text,
  phone_number text,
  recovery_email text,
  hint_question text,
  hint_answer text,
  profile_picture_url text,
  user_status text,
  onboarding_completed boolean,
  must_change_password boolean,
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.builders_profiles add column if not exists username text;
alter table public.builders_profiles add column if not exists full_name text;
alter table public.builders_profiles add column if not exists phone_number text;
alter table public.builders_profiles add column if not exists recovery_email text;
alter table public.builders_profiles add column if not exists hint_question text;
alter table public.builders_profiles add column if not exists hint_answer text;
alter table public.builders_profiles add column if not exists profile_picture_url text;
alter table public.builders_profiles add column if not exists user_status text;
alter table public.builders_profiles add column if not exists onboarding_completed boolean;
alter table public.builders_profiles add column if not exists must_change_password boolean;
alter table public.builders_profiles add column if not exists created_at timestamptz;
alter table public.builders_profiles add column if not exists updated_at timestamptz;

-- ---------------------------------------------------------- user_roles
create table if not exists public.builders_user_roles (
  id uuid primary key,
  user_id uuid,
  role text,
  assigned_at timestamptz
);

alter table public.builders_user_roles add column if not exists user_id uuid;
alter table public.builders_user_roles add column if not exists role text;
alter table public.builders_user_roles add column if not exists assigned_at timestamptz;

-- -------------------------------------------------- leave_applications
create table if not exists public.builders_leave_applications (
  id uuid primary key,
  user_id uuid,
  leave_type_id uuid,
  from_date date,
  to_date date,
  total_days numeric,
  reason text,
  status text,
  approved_by uuid,
  approved_at timestamptz,
  applied_date timestamptz,
  approved_date timestamptz,
  is_half_day boolean,
  half_day_period text,
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.builders_leave_applications add column if not exists user_id uuid;
alter table public.builders_leave_applications add column if not exists leave_type_id uuid;
alter table public.builders_leave_applications add column if not exists from_date date;
alter table public.builders_leave_applications add column if not exists to_date date;
alter table public.builders_leave_applications add column if not exists total_days numeric;
alter table public.builders_leave_applications add column if not exists reason text;
alter table public.builders_leave_applications add column if not exists status text;
alter table public.builders_leave_applications add column if not exists approved_by uuid;
alter table public.builders_leave_applications add column if not exists approved_at timestamptz;
alter table public.builders_leave_applications add column if not exists applied_date timestamptz;
alter table public.builders_leave_applications add column if not exists approved_date timestamptz;
alter table public.builders_leave_applications add column if not exists is_half_day boolean;
alter table public.builders_leave_applications add column if not exists half_day_period text;
alter table public.builders_leave_applications add column if not exists created_at timestamptz;
alter table public.builders_leave_applications add column if not exists updated_at timestamptz;

-- --------------------------------------------------------- lock it down
alter table public.builders_users              enable row level security;
alter table public.builders_employees          enable row level security;
alter table public.builders_attendance         enable row level security;
alter table public.builders_profiles           enable row level security;
alter table public.builders_user_roles         enable row level security;
alter table public.builders_leave_applications enable row level security;

grant all on public.builders_users              to service_role;
grant all on public.builders_employees          to service_role;
grant all on public.builders_attendance         to service_role;
grant all on public.builders_profiles           to service_role;
grant all on public.builders_user_roles         to service_role;
grant all on public.builders_leave_applications to service_role;
