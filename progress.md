# Progress

## 2026.09 course correction — done (on branch, not deployed)

- Product repositioned: continuous source-risk protection for AI-assisted development.
  Provenance, AI-composition percentages, and M&A framing moved out of the pitch; editor
  attribution kept as optional history.
- New design system and marketing site (`/`, `/how-it-works`, `/pricing`, `/security`, `/docs`);
  generated editorial imagery with documented provenance; self-hosted, subset fonts with
  metric-matched fallbacks.
- Public `/demo`: fictional repo, real pipeline in the browser, full scan → inspect → fix →
  rescan → resolved loop, alternate decisions with required reasons.
- Scanner: `SimilarityProvider` seam, static-corpus provider, portable `runScanPipeline`, line-
  range evidence, bounded excerpts, bands, per-finding coverage, SPDX expression handling,
  tree-sitter path through the same seam.
- Resolution history: migration `20260921000500` (tracked findings, append-only resolutions,
  owner-checked user actions, service-role scan reconciliation with an explicit re-check
  contract).
- App: dashboard ("Your codebase today"), findings queue, question-led finding page with actions,
  history, evidence export with history and coverage.
- Billing: centralized plans (Free / Pro $49 / Team $199 / Diligence Pack / Enterprise);
  subscriptions fail closed without Price IDs; APEX $19 SKU separated and operator-only; plan
  derived from verified webhooks.
- Lattice seed regenerated through the real pipeline, with all three resolution outcomes.
- Tests: scanner/pipeline/providers, SPDX, PGlite database tests (RLS, functions, append-only,
  seed), plan config, plan derivation, resolution model, vocabulary, evidence mapping, demo
  walkthrough, homepage/pricing content guards.

## Earlier (still true)

- Supabase Auth, RLS on every table, security-advisor-clean (before this migration).
- Real GitHub ingestion with an SSRF-safe boundary; npm/PyPI license lookups; CycloneDX SBOM.
- Stripe webhook verification and idempotency; `create-checkout` fails closed without keys.
- VS Code extension: compiles, classifier tested.

## Blockers (credentials, not code)

- Stripe sandbox keys and subscription Price IDs; `APEX_CUSTOMER_ID`.
- `GITHUB_TOKEN` (unauthenticated GitHub API is rate-limited).
- A sales contact address (`VITE_SALES_EMAIL`).

## Deploy checklist for this branch

1. `supabase db push` (resolution-history migration).
2. `supabase functions deploy scan-repository create-checkout stripe-webhook billing-diagnostics`.
3. Optional: apply `scripts/lattice-seed.sql` with service-role access.
4. `npm run build && node scripts/deploy-worker-assets.mjs`.
5. Run the Supabase security advisor again (two new `security definer` functions — both set
   `search_path = ''` and have narrowed grants).

## Out of scope (documented, not built)

Continuous PR/push monitoring, private repositories, GitHub checks, team features, plan
enforcement, additional similarity providers, async worker, Sigstore signing, Marketplace
packaging of the VS Code extension.
