-- Resolution history.
--
-- A scan produces observations (scan_findings). A *tracked finding* is the same
-- issue recognised across scans of one repository via a stable finding_key, with
-- a lifecycle status. finding_resolutions is the append-only record of what
-- happened to it: detected → reviewed → remediation recorded → clean rescan →
-- resolved (or accepted risk / dismissed as a false positive, or reopened).
--
-- Integrity rules:
--   * Clients never write tracked_findings or finding_resolutions directly.
--   * User decisions go through record_finding_action() (owner-checked, reason
--     required for accepting risk or dismissing).
--   * Only the scanner (service role) runs sync_tracked_findings(), and a
--     finding is only auto-resolved when the scan provably re-checked it.
--   * History rows can't be updated by anyone; they disappear only when the
--     owning repository is deleted.
-- See docs/DATA_MODEL.md and docs/SECURITY.md.

-- ---------------------------------------------------------------------------
-- Stable identity on per-scan observations
-- ---------------------------------------------------------------------------
alter table public.scan_findings add column if not exists finding_key text;
create index if not exists scan_findings_scan_key_idx on public.scan_findings (scan_id, finding_key);

-- ---------------------------------------------------------------------------
-- tracked_findings
-- ---------------------------------------------------------------------------
create table public.tracked_findings (
  id uuid primary key default gen_random_uuid(),
  repository_id uuid not null references public.repositories (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  finding_key text not null,
  type text not null check (type in ('license', 'structural_similarity', 'provenance_mix', 'policy')),
  provider_id text,
  title text not null,
  file_path text,
  severity text not null check (severity in ('info', 'review', 'blocking')),
  band text check (band in ('common_pattern', 'review_suggested', 'strong_match')),
  status text not null default 'open'
    check (status in ('open', 'in_review', 'resolved', 'accepted_risk', 'dismissed_false_positive')),
  remediation_pending boolean not null default false,
  first_scan_id uuid references public.scans (id) on delete set null,
  last_seen_scan_id uuid references public.scans (id) on delete set null,
  latest_finding_id uuid references public.scan_findings (id) on delete set null,
  resolved_scan_id uuid references public.scans (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (repository_id, finding_key)
);

create index tracked_findings_owner_status_idx on public.tracked_findings (owner_id, status);
create index tracked_findings_last_seen_scan_idx on public.tracked_findings (last_seen_scan_id);

-- ---------------------------------------------------------------------------
-- finding_resolutions (append-only)
-- ---------------------------------------------------------------------------
create table public.finding_resolutions (
  id uuid primary key default gen_random_uuid(),
  tracked_finding_id uuid not null references public.tracked_findings (id) on delete cascade,
  repository_id uuid not null references public.repositories (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  actor_kind text not null check (actor_kind in ('user', 'system')),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in (
    'detected', 'review_started', 'remediation_recorded', 'rescan_still_detected',
    'rescan_clean', 'reopened', 'accepted_risk', 'dismissed_false_positive', 'note'
  )),
  from_status text,
  to_status text not null,
  note text check (note is null or char_length(note) <= 2000),
  scan_id uuid references public.scans (id) on delete set null,
  rescan_scan_id uuid references public.scans (id) on delete set null,
  revision text check (revision is null or char_length(revision) <= 120),
  created_at timestamptz not null default now()
);

create index finding_resolutions_tracked_idx on public.finding_resolutions (tracked_finding_id, created_at);
create index finding_resolutions_owner_idx on public.finding_resolutions (owner_id, created_at desc);
create index finding_resolutions_repository_idx on public.finding_resolutions (repository_id);

create function public.prevent_finding_resolution_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'finding_resolutions is append-only' using errcode = '42501';
end;
$$;

create trigger finding_resolutions_append_only
  before update on public.finding_resolutions
  for each row execute function public.prevent_finding_resolution_update();

-- ---------------------------------------------------------------------------
-- Row Level Security: read own (or the public demo repository); no client writes.
-- ---------------------------------------------------------------------------
alter table public.tracked_findings enable row level security;
alter table public.finding_resolutions enable row level security;

create policy "tracked_findings_select_own_or_demo" on public.tracked_findings
  for select using (
    (select auth.uid()) = owner_id
    or exists (select 1 from public.repositories r where r.id = repository_id and r.is_demo = true)
  );

create policy "finding_resolutions_select_own_or_demo" on public.finding_resolutions
  for select using (
    (select auth.uid()) = owner_id
    or exists (select 1 from public.repositories r where r.id = repository_id and r.is_demo = true)
  );

-- ---------------------------------------------------------------------------
-- record_finding_action: the only way a person changes a finding's status.
-- ---------------------------------------------------------------------------
create function public.record_finding_action(
  p_tracked_finding_id uuid,
  p_action text,
  p_note text default null,
  p_revision text default null
)
returns public.tracked_findings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_finding public.tracked_findings;
  v_to text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_revision text := nullif(btrim(coalesce(p_revision, '')), '');
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_finding from public.tracked_findings where id = p_tracked_finding_id for update;
  if not found or v_finding.owner_id <> v_uid then
    raise exception 'finding not found' using errcode = 'P0002';
  end if;

  if char_length(coalesce(v_note, '')) > 2000 then
    raise exception 'note is too long (2000 characters max)' using errcode = '22023';
  end if;
  if char_length(coalesce(v_revision, '')) > 120 then
    raise exception 'revision is too long (120 characters max)' using errcode = '22023';
  end if;

  if p_action = 'review_started' then
    if v_finding.status <> 'open' then
      raise exception 'only an open finding can move into review' using errcode = '22023';
    end if;
    v_to := 'in_review';
  elsif p_action = 'remediation_recorded' then
    if v_finding.status not in ('open', 'in_review') then
      raise exception 'a fix can only be recorded on an open finding' using errcode = '22023';
    end if;
    v_to := 'in_review';
  elsif p_action in ('accepted_risk', 'dismissed_false_positive') then
    if v_finding.status not in ('open', 'in_review') then
      raise exception 'only an open finding can be accepted or dismissed' using errcode = '22023';
    end if;
    if v_note is null then
      raise exception 'a reason is required' using errcode = '22023';
    end if;
    v_to := p_action;
  elsif p_action = 'reopened' then
    if v_finding.status not in ('accepted_risk', 'dismissed_false_positive') then
      raise exception 'only an accepted or dismissed finding can be reopened' using errcode = '22023';
    end if;
    v_to := 'open';
  elsif p_action = 'note' then
    if v_note is null then
      raise exception 'a note needs text' using errcode = '22023';
    end if;
    v_to := v_finding.status;
  else
    raise exception 'unsupported action: %', p_action using errcode = '22023';
  end if;

  insert into public.finding_resolutions
    (tracked_finding_id, repository_id, owner_id, actor_kind, actor_id, action, from_status, to_status, note, scan_id, revision)
  values
    (v_finding.id, v_finding.repository_id, v_finding.owner_id, 'user', v_uid, p_action, v_finding.status, v_to, v_note,
     v_finding.last_seen_scan_id, v_revision);

  update public.tracked_findings
     set status = v_to,
         remediation_pending = case
           when p_action = 'remediation_recorded' then true
           when v_to in ('accepted_risk', 'dismissed_false_positive', 'open') then false
           else remediation_pending
         end,
         updated_at = now()
   where id = v_finding.id
  returning * into v_finding;

  return v_finding;
end;
$$;

revoke all on function public.record_finding_action(uuid, text, text, text) from public, anon;
grant execute on function public.record_finding_action(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- sync_tracked_findings: reconcile one completed scan into resolution history.
-- Called by the scanner with the service role only.
--   * new actionable finding            → tracked, 'detected'
--   * resolved finding seen again       → 'reopened'
--   * fix recorded but still detected   → 'rescan_still_detected'
--   * accepted / dismissed seen again   → decision kept
--   * open finding the scan re-checked
--     and no longer sees                → 'rescan_clean', status resolved
-- "Re-checked" is explicit: the file is in the scan's checkedPaths (and its
-- provider ran), the dependency manifests were evaluated, or the scanner
-- reports the file is gone from the repository (p_missing_paths). A truncated
-- scan never resolves anything.
-- ---------------------------------------------------------------------------
create function public.sync_tracked_findings(p_scan_id uuid, p_missing_paths text[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scan public.scans;
  v_summary jsonb;
  v_checked_paths text[];
  v_ingested_paths text[];
  v_providers text[];
  v_types text[];
  v_manifests_checked boolean;
  v_truncated boolean;
  v_missing text[] := coalesce(p_missing_paths, '{}');
  v_detected integer := 0;
  v_reopened integer := 0;
  v_still integer := 0;
  v_resolved integer := 0;
  v_band text;
  v_note text;
  f public.scan_findings;
  t public.tracked_findings;
begin
  select * into v_scan from public.scans where id = p_scan_id;
  if not found then
    raise exception 'scan not found' using errcode = 'P0002';
  end if;
  if v_scan.status <> 'complete' then
    raise exception 'scan is not complete' using errcode = '22023';
  end if;

  v_summary := coalesce(v_scan.summary_json, '{}'::jsonb);
  v_checked_paths := case when jsonb_typeof(v_summary -> 'checkedPaths') = 'array'
    then array(select jsonb_array_elements_text(v_summary -> 'checkedPaths')) else '{}' end;
  v_ingested_paths := case when jsonb_typeof(v_summary -> 'ingestedPaths') = 'array'
    then array(select jsonb_array_elements_text(v_summary -> 'ingestedPaths')) else '{}' end;
  v_providers := case when jsonb_typeof(v_summary -> 'providersRun') = 'array'
    then array(select jsonb_array_elements_text(v_summary -> 'providersRun')) else '{}' end;
  v_types := case when jsonb_typeof(v_summary -> 'evaluatedFindingTypes') = 'array'
    then array(select jsonb_array_elements_text(v_summary -> 'evaluatedFindingTypes')) else '{}' end;
  v_manifests_checked := jsonb_typeof(v_summary -> 'manifestsChecked') = 'array'
    and jsonb_array_length(v_summary -> 'manifestsChecked') > 0;
  v_truncated := coalesce((v_summary ->> 'findingsTruncated')::boolean, false);

  -- 1. Every actionable finding this scan observed.
  for f in
    select distinct on (sf.finding_key) sf.*
      from public.scan_findings sf
     where sf.scan_id = p_scan_id
       and sf.finding_key is not null
       and sf.severity in ('review', 'blocking')
     order by sf.finding_key, sf.created_at
  loop
    v_band := f.evidence_json ->> 'band';
    if v_band is not null and v_band not in ('common_pattern', 'review_suggested', 'strong_match') then
      v_band := null;
    end if;

    select * into t
      from public.tracked_findings
     where repository_id = v_scan.repository_id and finding_key = f.finding_key
       for update;

    if not found then
      insert into public.tracked_findings
        (repository_id, owner_id, finding_key, type, provider_id, title, file_path, severity, band, status,
         first_scan_id, last_seen_scan_id, latest_finding_id)
      values
        (v_scan.repository_id, v_scan.owner_id, f.finding_key, f.type, f.evidence_json -> 'provider' ->> 'id', f.title,
         f.file_path, f.severity, v_band, 'open', p_scan_id, p_scan_id, f.id)
      returning * into t;

      insert into public.finding_resolutions
        (tracked_finding_id, repository_id, owner_id, actor_kind, action, from_status, to_status, scan_id)
      values
        (t.id, t.repository_id, t.owner_id, 'system', 'detected', null, 'open', p_scan_id);
      v_detected := v_detected + 1;
    else
      if t.status = 'resolved' then
        insert into public.finding_resolutions
          (tracked_finding_id, repository_id, owner_id, actor_kind, action, from_status, to_status, note, scan_id)
        values
          (t.id, t.repository_id, t.owner_id, 'system', 'reopened', 'resolved', 'open',
           'Detected again by a later scan.', p_scan_id);
        update public.tracked_findings
           set status = 'open', resolved_at = null, resolved_scan_id = null, remediation_pending = false
         where id = t.id;
        v_reopened := v_reopened + 1;
      elsif t.status in ('open', 'in_review') and t.remediation_pending then
        insert into public.finding_resolutions
          (tracked_finding_id, repository_id, owner_id, actor_kind, action, from_status, to_status, note, scan_id, rescan_scan_id)
        values
          (t.id, t.repository_id, t.owner_id, 'system', 'rescan_still_detected', t.status, t.status,
           'The rescan still detects this match.', t.last_seen_scan_id, p_scan_id);
        update public.tracked_findings set remediation_pending = false where id = t.id;
        v_still := v_still + 1;
      end if;

      update public.tracked_findings
         set last_seen_scan_id = p_scan_id,
             latest_finding_id = f.id,
             title = f.title,
             severity = f.severity,
             band = coalesce(v_band, band),
             updated_at = now()
       where id = t.id;
    end if;
  end loop;

  -- 2. Resolve what this scan re-checked and no longer sees.
  if not v_truncated then
    for t in
      select tf.*
        from public.tracked_findings tf
       where tf.repository_id = v_scan.repository_id
         and tf.status in ('open', 'in_review')
         and tf.type = any (v_types)
         and not exists (
           select 1 from public.scan_findings sf
            where sf.scan_id = p_scan_id
              and sf.finding_key = tf.finding_key
              and sf.severity in ('review', 'blocking')
         )
         for update
    loop
      v_note := null;
      if t.file_path is not null and t.file_path = any (v_missing) then
        v_note := format('%s is no longer in the repository.', t.file_path);
      elsif t.type = 'structural_similarity' then
        continue when t.file_path is null or not (t.file_path = any (v_checked_paths));
        continue when t.provider_id is not null and not (t.provider_id = any (v_providers));
        v_note := format('Re-checked %s; the match is no longer present.', t.file_path);
      elsif t.type = 'license' and t.finding_key like 'license:dependency:%' then
        continue when not v_manifests_checked;
        v_note := 'Dependency manifests re-checked; this dependency no longer needs attention.';
      elsif t.type = 'license' and t.finding_key like 'license:file:%' then
        continue when t.file_path is null or not (t.file_path = any (v_ingested_paths));
        v_note := format('Re-checked %s; the license no longer needs attention.', t.file_path);
      else
        continue;
      end if;

      insert into public.finding_resolutions
        (tracked_finding_id, repository_id, owner_id, actor_kind, action, from_status, to_status, note, scan_id, rescan_scan_id)
      values
        (t.id, t.repository_id, t.owner_id, 'system', 'rescan_clean', t.status, 'resolved', v_note,
         t.last_seen_scan_id, p_scan_id);

      update public.tracked_findings
         set status = 'resolved',
             resolved_scan_id = p_scan_id,
             resolved_at = now(),
             remediation_pending = false,
             updated_at = now()
       where id = t.id;
      v_resolved := v_resolved + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'detected', v_detected,
    'reopened', v_reopened,
    'stillDetected', v_still,
    'resolved', v_resolved,
    'truncated', v_truncated
  );
end;
$$;

revoke all on function public.sync_tracked_findings(uuid, text[]) from public, anon, authenticated;
grant execute on function public.sync_tracked_findings(uuid, text[]) to service_role;
