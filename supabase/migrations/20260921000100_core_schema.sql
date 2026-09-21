-- PoryGen core schema: profiles, repositories, scans, findings, provenance
-- events, and billing tables. See docs/DATA_MODEL.md for the full rationale.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- repositories
-- ---------------------------------------------------------------------------
create table public.repositories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  provider text not null default 'github' check (provider in ('github', 'demo')),
  clone_url text not null,
  default_branch text not null default 'main',
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_scanned_at timestamptz,
  unique (owner_id, clone_url)
);

create index repositories_owner_id_idx on public.repositories (owner_id);

-- ---------------------------------------------------------------------------
-- scans
-- ---------------------------------------------------------------------------
create table public.scans (
  id uuid primary key default gen_random_uuid(),
  repository_id uuid not null references public.repositories (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'ingesting', 'indexing', 'normalizing_ast', 'fingerprinting',
                       'analyzing_licenses', 'building_provenance_summary', 'complete', 'failed')),
  policy_version text not null default '2026.1',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  files_scanned integer not null default 0,
  dependencies_scanned integer not null default 0,
  risk_level text check (risk_level in ('clear', 'review', 'blocking', 'unknown')),
  summary_json jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now()
);

create index scans_repository_id_idx on public.scans (repository_id);
create index scans_owner_id_idx on public.scans (owner_id);

-- ---------------------------------------------------------------------------
-- scan_findings
-- ---------------------------------------------------------------------------
create table public.scan_findings (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans (id) on delete cascade,
  type text not null check (type in ('license', 'structural_similarity', 'provenance_mix', 'policy')),
  severity text not null check (severity in ('info', 'review', 'blocking')),
  title text not null,
  file_path text,
  line_start integer,
  line_end integer,
  confidence numeric(4, 3) check (confidence >= 0 and confidence <= 1),
  evidence_json jsonb not null default '{}'::jsonb,
  remediation text,
  created_at timestamptz not null default now()
);

create index scan_findings_scan_id_idx on public.scan_findings (scan_id);

-- ---------------------------------------------------------------------------
-- provenance_events
-- ---------------------------------------------------------------------------
create table public.provenance_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  repository_id uuid not null references public.repositories (id) on delete cascade,
  source_type text not null check (source_type in ('human', 'ai', 'imported', 'generated', 'unknown')),
  actor_type text not null check (actor_type in ('developer', 'assistant', 'automation', 'external')),
  provider text,
  tool text,
  file_path text not null,
  commit_sha text,
  parent_event_id uuid references public.provenance_events (id),
  content_hash text not null,
  diff_hash text,
  event_timestamp timestamptz not null,
  metadata_json jsonb not null default '{}'::jsonb,
  previous_event_hash text,
  event_hash text not null,
  created_at timestamptz not null default now(),
  unique (repository_id, event_hash)
);

create index provenance_events_repository_id_idx on public.provenance_events (repository_id, event_timestamp);
create index provenance_events_owner_id_idx on public.provenance_events (owner_id);

-- ---------------------------------------------------------------------------
-- billing_customers
-- ---------------------------------------------------------------------------
create table public.billing_customers (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_customer_id text unique,
  apex_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- billing_events
-- ---------------------------------------------------------------------------
create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  user_id uuid references public.profiles (id) on delete set null,
  event_type text not null,
  stripe_customer_id text,
  checkout_session_id text,
  payment_intent_id text,
  price_id text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  payload_summary_json jsonb not null default '{}'::jsonb
);

create index billing_events_user_id_idx on public.billing_events (user_id);
