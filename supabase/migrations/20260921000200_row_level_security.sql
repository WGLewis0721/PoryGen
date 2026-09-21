-- Row Level Security: every table users can reach is owner-scoped, except
-- rows explicitly flagged `is_demo` (the seeded Lattice project), which are
-- readable by anyone so the public "View sample audit" flow needs no login.
-- Service-role usage (Edge Functions, migrations) bypasses RLS by design and
-- is never exposed to the browser.

alter table public.profiles enable row level security;
alter table public.repositories enable row level security;
alter table public.scans enable row level security;
alter table public.scan_findings enable row level security;
alter table public.provenance_events enable row level security;
alter table public.billing_customers enable row level security;
alter table public.billing_events enable row level security;

-- profiles: a user reads/updates only their own profile row.
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- repositories: owner CRUD, plus public read of demo repositories.
create policy "repositories_select_own_or_demo" on public.repositories
  for select using (auth.uid() = owner_id or is_demo = true);
create policy "repositories_insert_own" on public.repositories
  for insert with check (auth.uid() = owner_id);
create policy "repositories_update_own" on public.repositories
  for update using (auth.uid() = owner_id);
create policy "repositories_delete_own" on public.repositories
  for delete using (auth.uid() = owner_id);

-- scans: owner CRUD, plus public read of scans on demo repositories.
create policy "scans_select_own_or_demo" on public.scans
  for select using (
    auth.uid() = owner_id
    or exists (select 1 from public.repositories r where r.id = repository_id and r.is_demo = true)
  );
create policy "scans_insert_own" on public.scans
  for insert with check (auth.uid() = owner_id);
create policy "scans_update_own" on public.scans
  for update using (auth.uid() = owner_id);

-- scan_findings: readable if the parent scan is readable; writes go through
-- the service role from the scan-repository Edge Function only.
create policy "scan_findings_select_via_scan" on public.scan_findings
  for select using (
    exists (
      select 1 from public.scans s
      where s.id = scan_id
        and (s.owner_id = auth.uid()
             or exists (select 1 from public.repositories r where r.id = s.repository_id and r.is_demo = true))
    )
  );

-- provenance_events: owner CRUD, plus public read for demo repositories.
create policy "provenance_events_select_own_or_demo" on public.provenance_events
  for select using (
    auth.uid() = owner_id
    or exists (select 1 from public.repositories r where r.id = repository_id and r.is_demo = true)
  );
create policy "provenance_events_insert_own" on public.provenance_events
  for insert with check (auth.uid() = owner_id);

-- billing_customers / billing_events: strictly owner-only, no demo exception —
-- this is real (sandboxed) financial linkage data.
create policy "billing_customers_select_own" on public.billing_customers
  for select using (auth.uid() = user_id);
create policy "billing_events_select_own" on public.billing_events
  for select using (auth.uid() = user_id);
