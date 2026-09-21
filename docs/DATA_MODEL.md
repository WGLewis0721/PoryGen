# Data model

All tables live in `public`, defined across `supabase/migrations/`. Every table has RLS enabled
— see [SECURITY.md](SECURITY.md).

## profiles

`id` (= `auth.users.id`), `email`, `display_name`, timestamps. Populated by the
`handle_new_user()` trigger.

## repositories

`id`, `owner_id`, `name`, `provider` (`github` | `demo`), `clone_url`, `default_branch`,
`visibility`, `is_demo` (only the seeded Lattice sample — public read), timestamps,
`last_scanned_at`. Unique on `(owner_id, clone_url)`.

## scans

`id`, `repository_id`, `owner_id`, `status`
(`queued → ingesting → indexing → normalizing_ast → fingerprinting → analyzing_licenses →
building_provenance_summary → complete | failed`; the last in-progress label is historical and
shows as "Preparing results"), `policy_version`, `started_at`, `finished_at`, `files_scanned`,
`dependencies_scanned`, `risk_level` (`clear` | `review` | `blocking` | `unknown`),
`summary_json`, `error_code`.

`summary_json` from pipeline 2026.09 adds `pipelineVersion`, `normalizer`, `coverage[]`,
`providersRun`, `providerErrors`, `checkedPaths`, `ingestedPaths`, `manifestsChecked`,
`evaluatedFindingTypes`, `findingsTruncated`, and per-file `similarity` counts. Readers treat
all of these as optional (older scans don't have them).

## scan_findings

Per-scan observations. `id`, `scan_id`, `type` (`license` | `structural_similarity` |
`provenance_mix` | `policy`), `severity` (`info` | `review` | `blocking`), `title`, `file_path`,
`line_start`, `line_end`, `confidence`, `evidence_json`, `remediation`, `created_at`, and
**`finding_key`** (added in `20260921000500`; null on older rows).

`finding_key` is the stable identity of an issue across scans of a repository:

| Type | Key |
|---|---|
| similarity | `similarity:{providerId}:{candidateId}:{filePath}` |
| dependency license | `license:dependency:{ecosystem}:{name}` |
| license file | `license:file:{path}` |
| editor attribution | `provenance:{filePath}` |

## tracked_findings (resolution history)

One row per actionable issue per repository, living across scans. `id`, `repository_id`,
`owner_id`, `finding_key` (unique per repository), `type`, `provider_id`, `title`, `file_path`,
`severity`, `band`, `status`, `remediation_pending`, `first_scan_id`, `last_seen_scan_id`,
`latest_finding_id`, `resolved_scan_id`, `resolved_at`, timestamps.

`status`: `open` · `in_review` · `resolved` · `accepted_risk` · `dismissed_false_positive`.

Only `review`/`blocking` observations become tracked findings; informational rows (clear
licenses, common patterns, editor attribution) stay per-scan.

## finding_resolutions (append-only)

What happened to a tracked finding, in order. `tracked_finding_id`, `repository_id`,
`owner_id`, `actor_kind` (`user` | `system`), `actor_id`, `action`, `from_status`, `to_status`,
`note` (≤ 2,000 chars), `scan_id` (the scan the action refers to), `rescan_scan_id` (the scan
that verified it), `revision` (commit/revision, ≤ 120 chars), `created_at`.

Actions: `detected` · `review_started` · `remediation_recorded` · `rescan_still_detected` ·
`rescan_clean` (→ resolved) · `reopened` · `accepted_risk` · `dismissed_false_positive` · `note`.

A `before update` trigger rejects every update, including from the service role. Rows are only
removed by cascade when their repository is deleted.

A resolved finding reads as FOUND → REVIEWED → REMEDIATED → RESCANNED → RESOLVED
(`src/lib/resolution.ts#stagesFromHistory`; any user decision counts as reviewed, and a reopen
starts a new cycle).

## Functions

**`record_finding_action(p_tracked_finding_id, p_action, p_note, p_revision)`** — `security
definer`, `search_path = ''`, executable by `authenticated` only. Verifies `auth.uid()` owns the
finding (non-owners get "finding not found"), enforces transitions, requires a note for
`accepted_risk` / `dismissed_false_positive` / `note`, appends a resolution row, and updates the
status. People can start review, record a fix, accept risk, dismiss, reopen, or note — never
resolve.

| From | Allowed |
|---|---|
| open | review_started, remediation_recorded, accepted_risk*, dismissed_false_positive*, note* |
| in_review | remediation_recorded, accepted_risk*, dismissed_false_positive*, note* |
| accepted_risk, dismissed_false_positive | reopened, note* |
| resolved | note* |

\* reason required.

**`sync_tracked_findings(p_scan_id, p_missing_paths)`** — `security definer`, executable by
`service_role` only (called by `scan-repository` after a scan completes). Idempotent. Detects new
issues, reopens resolved ones that came back, records failed fixes, keeps accepted/dismissed
decisions, and resolves what the scan provably re-checked — see
[SCANNER.md](SCANNER.md#resolution-contract). Returns
`{ detected, reopened, stillDetected, resolved, truncated }`.

## provenance_events (optional editor attribution)

Unchanged: VS Code extension events with a SHA-256 hash chain (`previous_event_hash`,
`event_hash`). See [PROVENANCE.md](PROVENANCE.md).

## billing_customers · billing_events

Unchanged schema. `billing_events.payload_summary_json` now also records `porygen_plan`
(`pro` | `team` | `apex_dogfood`), checkout `mode`, and `subscription_status` — non-secret
fields the app uses to derive plan state. Untagged older completions are treated as the APEX
test, never as a subscription.

## Indexes

Previous indexes plus `scan_findings(scan_id, finding_key)`, `tracked_findings(owner_id,
status)`, `tracked_findings(last_seen_scan_id)`, `finding_resolutions(tracked_finding_id,
created_at)`, `finding_resolutions(owner_id, created_at desc)`, `finding_resolutions(repository_id)`.
