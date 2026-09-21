# PoryGen

**Move fast. Keep it yours.**

PoryGen checks the code AI agents put into your product so you can catch suspicious source
similarity and license risk before you ship someone else's code as your own.

> If AI coding becomes normal, checking what the AI gave you should become normal too.

🔗 **Live**: [porygen.vercel.app](https://porygen.vercel.app) ·
**Sample demo (no account)**: `/demo`

## The loop

```
AI agent adds code
  → PoryGen checks the new or changed code
  → each file is clear, a common pattern, review suggested, or a strong source match
  → you see the possible source, the evidence, and the license that comes with it
  → you review, replace or rewrite, dismiss a false positive, or accept the risk with a reason
  → PoryGen rescans
  → the finding resolves on a clean rescan (or stays open)
  → every step is kept as resolution history
```

The everyday value is another set of eyes on what your AI gave you. The long-term side effect
is a record of what was checked, flagged, fixed, and confirmed — useful later, never the pitch.

PoryGen is vendor-independent (it checks the repository, not the agent), Git-centered, and
built for remediation rather than a one-off report. It did **not** invent fingerprinting, SCA,
SBOMs, or attribution; its contribution is the join — see [how it fits](docs/ARCHITECTURE.md#where-porygen-fits).

## What's real, what's sample data, what isn't built

| Surface | Status |
|---|---|
| Marketing site (`/`, `/how-it-works`, `/pricing`, `/security`, `/docs`) | Real |
| Public demo (`/demo`) | **Sample data, real engine.** A fictional repository and fictional "public source" run through the production scan pipeline in the browser. Labelled *Sample interactive demo* on screen. |
| Auth (sign up, sign in, session, sign out) | Real — Supabase Auth |
| Scanning public GitHub repositories | Real — `scan-repository` Edge Function (40 files / 200 KB each / 2 MB per scan) |
| Scan pipeline (normalize → Winnowing → similarity providers → license context → findings) | Real — `packages/provenance-core/src/scanner/pipeline.ts`, shared by the Edge Function, the demo, the seed script, and tests |
| Similarity coverage | **Limited and stated.** One provider today: PoryGen's bundled reference corpus (4 original reference implementations). Not GitHub, not package registries, not the internet. Every finding names its provider and coverage. |
| License context | Real — npm registry / PyPI lookups, SPDX expressions, license-file detection |
| Side-by-side match view with matched line ranges | Real (scans from pipeline 2026.09 onward store the matched excerpt; older findings show the reference source only) |
| Resolution workflow (review, record a fix, dismiss, accept risk, reopen) | Real — `record_finding_action()` in Postgres, owner-checked, reasons required. **Requires migration `20260921000500`** |
| Automatic resolution on rescan | Real — `sync_tracked_findings()`, service role only, resolves only what a scan provably re-checked |
| Resolution history | Real, append-only (updates are blocked by trigger) |
| Evidence export (JSON + print summary) | Real, now includes resolution history and coverage |
| Editor attribution (VS Code extension, hash-chained ledger) | Real, optional — repositioned under History |
| Continuous monitoring (every push / PR), private repos, GitHub checks, team access, policies | **Not built** — marked *In development* wherever they appear |
| Paid plans (Pro $49/mo, Team $199/mo) | Checkout code is real and **fails closed** until `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_TEAM_MONTHLY` are configured |
| Plan limits | Displayed, **not enforced** (early access) |
| Diligence Pack, Enterprise / private deployment | On request / roadmap. No sales contact is configured yet (`VITE_SALES_EMAIL`, TODO: client to supply) |
| APEX dogfood $19 one-time SKU | Real, **operator-only** (`/billing/diagnostics`). Never shown as customer pricing and never grants a plan. See [docs/APEX_DOGFOOD.md](docs/APEX_DOGFOOD.md) |
| Sigstore signing | Not implemented — attestations are labelled "local hash-chain attestation" |

## What PoryGen does not claim

- **Not exhaustive.** A clear result means nothing matched the sources that scan compared against.
- **Not proof of copying.** Similarity is evidence for a human to review.
- **Not legal advice.** License context describes what a license family usually requires.
- **Not a certification.** The resolution history is a record, not a guarantee of originality.
- **Not an AI detector.** Editor attribution records edit shape (size, timing), never content, as a heuristic.

## Local setup

```bash
npm install
cp .env.example .env.local   # VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

Without Supabase credentials the marketing site and the `/demo` walkthrough work fully; sign-in
and the app show a clear "not configured" state.

```bash
npm test         # vitest — scanner, pipeline, providers, resolution-history SQL (PGlite), seed, UI
npm run build    # tsc -b && vite build
npm run lint     # oxlint
```

The database tests run every migration in `supabase/migrations/` against PGlite (real Postgres
compiled to WASM) with Supabase-shaped roles and `auth.uid()`, so RLS policies and the
resolution functions are exercised for real without touching a live project.

## Environment variables

See [.env.example](.env.example). `VITE_*` values are public by design (the publishable key is
only as powerful as RLS allows). Everything else — Stripe keys and price IDs,
`APEX_CUSTOMER_ID`, `GITHUB_TOKEN` — is an Edge Function secret set with `supabase secrets set`
and never bundled.

## Deploying this change

Order matters because the frontend degrades gracefully but the new Edge Functions expect the
new schema:

```bash
supabase db push                                   # applies 20260921000500_resolution_history.sql
node scripts/sync-vendored-copies.mjs              # already run; re-run after touching provenance-core
supabase functions deploy scan-repository create-checkout stripe-webhook billing-diagnostics
npm run seed > scripts/lattice-seed.sql            # optional: refresh the public sample (already generated)
# apply scripts/lattice-seed.sql with service-role access
npm run build && node scripts/deploy-worker-assets.mjs
```

Until the migration is applied, the app still scans and shows findings; resolution tracking
shows an explicit "not enabled on this deployment yet" state instead of failing.

## Documentation

- [ROADMAP.md](ROADMAP.md) — product, commercialization, APEX validation, and execution sequence
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system shape, scan path, provider seam, async-worker evolution
- [docs/SCANNER.md](docs/SCANNER.md) — normalization, Winnowing, providers, bands, coverage, limits
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md) — tables and the resolution-history model
- [docs/SECURITY.md](docs/SECURITY.md) — RLS, ingestion boundary, secrets, retention
- [docs/PROVENANCE.md](docs/PROVENANCE.md) — history, evidence export, optional editor attribution
- [docs/DEMO_FLOW.md](docs/DEMO_FLOW.md) — public demo and authenticated walkthrough
- [docs/STRIPE_SETUP.md](docs/STRIPE_SETUP.md) — subscriptions, webhook, fail-closed behaviour
- [docs/APEX_DOGFOOD.md](docs/APEX_DOGFOOD.md) — the separate operator test
- [docs/OPUS_HANDOFF.md](docs/OPUS_HANDOFF.md) — state of this pass and what's next
- [DESIGN.md](DESIGN.md) · [VISUAL-PLAN.md](VISUAL-PLAN.md) — visual system and imagery sources
