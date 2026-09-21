# Data model

All tables live in `public`, defined across `supabase/migrations/`. Every table has RLS
enabled — see [SECURITY.md](SECURITY.md) for the full policy set.

## profiles

| column | type | notes |
|---|---|---|
| id | uuid PK | = `auth.users.id` |
| email | text | |
| display_name | text | nullable |
| created_at / updated_at | timestamptz | |

Populated by the `handle_new_user()` trigger on `auth.users` insert.

## repositories

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| owner_id | uuid FK → profiles | |
| name | text | e.g. `expressjs/cors` |
| provider | text | `github` \| `demo` |
| clone_url | text | |
| default_branch | text | |
| visibility | text | `public` \| `private` |
| is_demo | boolean | `true` only for the seeded Lattice project — grants public read via RLS |
| created_at / updated_at / last_scanned_at | timestamptz | |

Unique on `(owner_id, clone_url)` — feeding the same repo twice updates it, doesn't
duplicate it.

## scans

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| repository_id | uuid FK | |
| owner_id | uuid FK | |
| status | text | `queued → ingesting → indexing → normalizing_ast → fingerprinting → analyzing_licenses → building_provenance_summary → complete \| failed` |
| policy_version | text | e.g. `2026.1` |
| started_at / finished_at | timestamptz | |
| files_scanned / dependencies_scanned | integer | |
| risk_level | text | `clear` \| `review` \| `blocking` \| `unknown` |
| summary_json | jsonb | terminal log, language list, fingerprint/finding counts, provenance composition, CycloneDX SBOM, content hash |
| error_code | text | nullable |

## scan_findings

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| scan_id | uuid FK | |
| type | text | `license` \| `structural_similarity` \| `provenance_mix` \| `policy` |
| severity | text | `info` \| `review` \| `blocking` |
| title, file_path, line_start, line_end | | nullable where not applicable |
| confidence | numeric(4,3) | 0–1, nullable |
| evidence_json | jsonb | detector-specific payload |
| remediation | text | nullable — null for CLEAR findings |

## provenance_events

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| owner_id, repository_id | uuid FK | |
| source_type | text | `human` \| `ai` \| `imported` \| `generated` \| `unknown` |
| actor_type | text | `developer` \| `assistant` \| `automation` \| `external` |
| provider, tool | text | nullable — e.g. `github-copilot` / `GitHub Copilot` |
| file_path | text | |
| commit_sha | text | nullable |
| parent_event_id | uuid FK → self | nullable |
| content_hash, diff_hash | text | |
| event_timestamp | timestamptz | |
| metadata_json | jsonb | carries finer-grained signals (e.g. the VS Code classifier's `human_modified_ai`) that don't fit the five canonical `source_type` buckets |
| previous_event_hash, event_hash | text | the hash chain — see [PROVENANCE.md](PROVENANCE.md) |

Unique on `(repository_id, event_hash)`.

## billing_customers

| column | type | notes |
|---|---|---|
| user_id | uuid PK/FK | |
| stripe_customer_id | text | unique, nullable until first checkout |
| apex_customer_id | text | nullable — see [APEX_DOGFOOD.md](APEX_DOGFOOD.md) |

No client-facing INSERT/UPDATE policy — written only by Edge Functions using the
service-role key.

## billing_events

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| stripe_event_id | text | **unique** — the idempotency key |
| user_id | uuid FK | nullable (resolved from Stripe metadata or customer lookup) |
| event_type | text | e.g. `checkout.session.completed` |
| stripe_customer_id, checkout_session_id, payment_intent_id, price_id | text | nullable |
| received_at, processed_at | timestamptz | |
| payload_summary_json | jsonb | non-secret fields only — never the raw Stripe payload |

## Indexes

`repositories(owner_id)`, `scans(repository_id)`, `scans(owner_id)`,
`scan_findings(scan_id)`, `provenance_events(repository_id, event_timestamp)`,
`provenance_events(owner_id)`, `billing_events(user_id)`.
