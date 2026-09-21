# Security

## Row Level Security

Every table has RLS enabled (`supabase/migrations/20260921000200_row_level_security.sql`,
hardened by `20260921000400_scan_findings_insert_policy.sql` after a live test caught a
missing policy — see below). Pattern: `auth.uid() = owner_id`, with an explicit `OR
is_demo = true` exception on `repositories`/`scans`/`provenance_events` so the seeded
Lattice project is publicly readable without weakening any real user's data. Billing
tables (`billing_customers`, `billing_events`) have **no client-facing write policy at
all** — those rows are written only by Edge Functions using the service-role key.

Verified with the Supabase security advisor: the `handle_new_user()` trigger function
was flagged as callable via PostgREST RPC by `anon`/`authenticated` roles despite being
`SECURITY DEFINER` — fixed by revoking `EXECUTE` from those roles (it now only runs as
the `auth.users` insert trigger). Advisor reported clean after the fix.

**A real bug this caught**: `scan-repository` writes findings using the *caller's own
JWT*, not a service role, so RLS applies to those inserts too. The initial migration only
had a SELECT policy on `scan_findings` — a live scan against `expressjs/cors` failed with
`new row violates row-level security policy for table "scan_findings"` until the missing
INSERT policy was added. Left as a documented example of RLS needing to cover every
write path a real caller uses, not just the ones exercised by manual testing.

## Server-side secrets

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, `APEX_CUSTOMER_ID`,
`GITHUB_TOKEN`, and the Supabase service-role key are Edge Function secrets only —
never bundled into the Vite build, never read by client code. `billing-diagnostics`
returns only non-secret derived values (booleans, a Price ID, a Stripe account ID fetched
live) and is unit-testable against exactly that contract.

## Webhook signature verification

`stripe-webhook` verifies `Stripe-Signature` against the raw request body (never the
parsed JSON, which wouldn't match) using HMAC-SHA256 and a constant-time comparison —
see [STRIPE_SETUP.md](STRIPE_SETUP.md).

## Boundary validation / SSRF protection

`supabase/functions/scan-repository/github.ts` accepts only
`https://github.com/<owner>/<repo>` or an `owner/repo` shorthand; owner/repo are
regex-validated (`^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$`) before any network call. Every
subsequent fetch targets a **hardcoded** host (`api.github.com`,
`raw.githubusercontent.com`) built from that validated owner/repo — never a URL
constructed from unsanitized user input. Rejected explicitly: non-`https` schemes,
non-`github.com` hosts, userinfo (`user:pass@`) tricks, and malformed paths.

License-registry lookups (`registry.npmjs.org`, `pypi.org`) are similarly fixed-host,
with a 3-second timeout and graceful fallback to `Unknown` on any failure.

## Repository/file limits

40 files, 200 KB per file, 2 MB total per scan; `node_modules`, `dist`, `build`, `vendor`,
`.git`, `.next`, `target`, `out`, `coverage`, `.venv`/`venv`, `__pycache__`, `.cache` are
skipped; only a fixed allowlist of text-source extensions is fetched.

## No code execution

The scanner only ever reads file text and tokenizes/hashes it. No `eval`, no dynamic
`require`/`import` of scanned content, no shell execution derived from repository
contents, anywhere in the pipeline.

## Secrets in the browser

No `localStorage` secrets beyond the Supabase session (managed by `supabase-js` itself)
and the demo entitlement counter (`src/lib/entitlements.ts` — display-only, not a
security boundary; real authorization is Postgres RLS). No raw Stripe payloads are ever
persisted — `billing_events.payload_summary_json` is an explicitly-constructed subset of
non-sensitive fields.

## Ownership checks

Every Supabase query in `src/lib/api.ts` is written against tables whose RLS policies
already enforce ownership — there's no code path that trusts a client-supplied user ID
over `auth.uid()`.

## Idempotency

`billing_events.stripe_event_id` is `UNIQUE`; `stripe-webhook` treats the resulting
`23505` as `{"received": true, "idempotent": true}`, not an error — a replayed webhook
never double-processes.
