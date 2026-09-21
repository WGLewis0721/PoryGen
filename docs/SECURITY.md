# Security

## Row Level Security

Every table has RLS enabled. Pattern: `auth.uid() = owner_id`, with an explicit `OR is_demo =
true` read exception for the seeded Lattice sample so it's viewable without an account.

- `repositories`, `scans`, `scan_findings`, `provenance_events` — unchanged policies (owner
  read/write; demo read).
- `tracked_findings`, `finding_resolutions` (new) — **select only** (own or demo). There are no
  client insert, update, or delete policies. Status changes go through
  `record_finding_action()`; scan reconciliation goes through `sync_tracked_findings()`.
- `billing_customers`, `billing_events` — owner read only; written by Edge Functions with the
  service role.

`supabase/tests/resolution.test.ts` runs all migrations against PGlite with Supabase-shaped
roles and verifies: cross-account reads are blocked, anonymous visitors see only the demo
repository, direct client writes to tracked findings and history fail, history can't be updated
even by the service role, only the service role can reconcile scans, transitions and reasons are
enforced, demo findings can't be acted on by other accounts, and the pre-existing scan/finding
policies still hold.

## Integrity of resolution history

- A person can never mark a finding resolved. Only a scan can, through
  `sync_tracked_findings`, which requires proof the finding was re-checked (see
  [SCANNER.md](SCANNER.md#resolution-contract)).
- `sync_tracked_findings` is executable by `service_role` only; `scan-repository` calls it with
  the service-role key after its own pipeline run.
- `finding_resolutions` is append-only (trigger), so decisions and their reasons can't be edited
  after the fact.
- Both functions are `security definer` with `search_path = ''` and fully-qualified names;
  `EXECUTE` is revoked from `public` and granted narrowly.

**Known limit (pre-existing design):** scans and scan findings are written with the caller's
JWT under RLS, so an account can write its own scan rows directly. Reconciliation only runs on
scans the Edge Function produced, which limits the impact, but diligence-grade evidence would
move scan writes to the service role inside the Edge Function and remove the client insert and
update policies on `scans` / `scan_findings`. That is a deliberate follow-up, not done here,
because it must ship together with the redeployed function.

## Server-side secrets

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTHLY`,
`STRIPE_PRICE_TEAM_MONTHLY`, `STRIPE_APEX_DOGFOOD_PRICE_ID` (legacy `STRIPE_PRO_PRICE_ID`),
`APEX_CUSTOMER_ID`, `GITHUB_TOKEN`, and the service-role key are Edge Function secrets only.
Browser-visible configuration is limited to `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SALES_EMAIL`, and `VITE_BILLING_CHECKOUT_ENABLED`.
`billing-diagnostics` returns only non-secret values (booleans, Price IDs, the Stripe account ID).

## Webhook verification

`stripe-webhook` verifies `Stripe-Signature` (HMAC-SHA256 over `${timestamp}.${rawBody}`,
constant-time comparison) against the raw body, and treats a duplicate `stripe_event_id` as an
idempotent success. Plan state is derived from those verified rows only; reaching
`/billing/success` is never treated as payment.

## Ingestion boundary (SSRF)

`supabase/functions/scan-repository/github.ts` accepts only `https://github.com/<owner>/<repo>`
or `owner/repo`; owner and repo are regex-validated before any request, and every fetch targets
a hardcoded host (`api.github.com`, `raw.githubusercontent.com`). Non-https schemes, other
hosts, and userinfo tricks are rejected. Registry lookups use fixed hosts with a 3-second
timeout.

## Limits and execution

40 files, 200 KB per file, 2 MB per scan; dependency, build, and vendor directories skipped;
text extensions only. The scanner reads text and hashes tokens — no `eval`, no dynamic import,
no shell execution, no builds.

## Data retention

PoryGen stores scan metadata, findings, and — for flagged files only — an excerpt of the matched
region (at most 40 lines / 4,000 characters) so the side-by-side view works. It does not store
the contents of files that weren't flagged, does not train models on customer code, and does not
send code to third-party AI services. Deleting a repository cascades to its scans, findings, and
resolution history. This is stated publicly on `/security`.

## The public demo

`/demo` runs entirely in the browser on fictional data; it makes no network requests for scan
data and writes nothing. The fictional "public source" lives under `git.example.org` (an RFC 2606
reserved domain), so it can't be mistaken for, or collide with, a real project.
