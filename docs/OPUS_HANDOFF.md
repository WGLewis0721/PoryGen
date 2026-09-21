# Handoff — 2026.09 course correction

This pass moved PoryGen from "provenance platform" to **continuous source-risk protection for
AI-assisted development**: detect → understand → fix → rescan → stay protected, with resolution
history as a side effect. This file records what landed, what is deliberately unfinished, and the
sharp edges.

## What landed

- **Positioning and site.** New editorial design system (Newsreader display serif, Public Sans,
  graphite / deep slate / sunrise / sand), generated cinematic imagery (see VISUAL-PLAN.md),
  homepage rebuilt in the brief's order, `/how-it-works`, `/security`, rewritten `/pricing` and
  `/docs`. `/product` → `/how-it-works`, `/enterprise` → `/pricing#enterprise`, `/lattice` →
  `/demo`. The Bit-Critter is now a small in-app status glyph only.
- **Public demo** (`/demo`): fictional repository, real pipeline in the browser, the full loop in
  about 90 seconds, no account.
- **Scanner seams.** `SimilarityProvider` interface, `createStaticCorpusProvider`, the reference
  corpus as a provider, a portable `runScanPipeline` shared by the Edge Function, demo, seed, and
  tests (including a tree-sitter run), line-range evidence and bounded excerpts, bands, honest
  per-finding coverage, better SPDX handling.
- **Resolution history.** Migration `20260921000500`: `finding_key`, `tracked_findings`,
  append-only `finding_resolutions`, `record_finding_action` (people) and
  `sync_tracked_findings` (scanner, service role). Verified against real Postgres (PGlite) in
  `supabase/tests/`.
- **App.** Dashboard reframed around "Your codebase today"; new Findings queue; finding page
  organised around the questions a founder asks, with the action panel; History replaces the
  provenance ledger (editor attribution kept as a secondary view); evidence export includes
  history and coverage.
- **Billing.** Plans centralized in `src/config/plans.ts`; subscriptions (`pro`, `team`) fail
  closed without Price IDs; the APEX $19 SKU is operator-only and tagged `apex_dogfood`; plan
  state is derived from verified webhooks.

## Not deployed

Nothing in this PR has been applied to the live Supabase project or redeployed. Order: `supabase
db push` → deploy the four Edge Functions → optionally re-seed Lattice → build and deploy the
frontend. The frontend degrades cleanly before the migration exists.

## Deliberately unfinished (next, in priority order)

1. **Continuous monitoring.** GitHub App (push / pull_request webhooks → queued scans), private
   repositories, PR status checks. Architecture: [ARCHITECTURE.md](ARCHITECTURE.md#evolving-the-scanner).
2. **Coverage.** A real second provider (licensed corpus or source-intelligence API). The UI and
   resolution rules are already provider-aware.
3. **Server-authoritative scan writes.** Move `scans` / `scan_findings` writes to the service
   role inside `scan-repository` and drop the client insert/update policies (see SECURITY.md).
4. **Async worker** on the Postgres queue, using the tree-sitter normalizer and a full checkout.
5. **Plan enforcement** once paid checkout opens (limits are displayed only today).
6. **Team features** (roles, shared policies, required-review rules) — advertised as In
   development.
7. **Sales contact.** Set `VITE_SALES_EMAIL` (TODO: client to supply); until then Enterprise and
   Diligence Pack show "a sales contact is being set up".

## Sharp edges

- The reference corpus is four original implementations. Real scans will rarely match anything,
  and a match means "resembles PoryGen's reference", which the UI states.
- Legacy findings (before 2026.09) have no `finding_key`, so they aren't tracked; a rescan
  creates tracked findings going forward.
- `scan-repository` falls back to inserting findings without `finding_key` if the column is
  missing, and skips reconciliation — so an out-of-order deploy degrades rather than fails.
- The Lattice seed (`scripts/lattice-seed.sql`) now needs the resolution migration applied first.

## Optional polish (unchanged, low priority)

- **Bit-Critter gaze kinematics** — `src/components/BitCritter.tsx` (inline `OPUS_TASK`
  comment). Pointer-following gaze, rAF + spring, ±5°, disabled under reduced motion. The critter
  is now secondary, so this matters less.
- The scanner-choreography and provenance-player tasks from the previous handoff are retired:
  the pages they targeted were replaced.
