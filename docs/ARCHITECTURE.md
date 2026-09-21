# Architecture

## Product shape

PoryGen is continuous source-risk protection for AI-assisted development. The matcher is an
engine; the product is the loop around it: **detect → understand → fix → rescan → stay
protected**, with resolution history kept as a side effect. The architecture is arranged so
the engine (and its source coverage) can improve or be replaced without changing that loop.

## System overview

```
Browser (React 19 / Vite SPA, React Router)
   │  supabase-js (publishable key; every query RLS-scoped)
   ▼
Supabase
   ├─ Auth (email/password)
   ├─ Postgres + RLS
   │    profiles · repositories · scans · scan_findings
   │    tracked_findings · finding_resolutions          ← resolution history
   │    provenance_events                              ← optional editor attribution
   │    billing_customers · billing_events
   │    functions: record_finding_action (authenticated) · sync_tracked_findings (service role)
   └─ Edge Functions (Deno)
        scan-repository     — auth, GitHub ingestion, pipeline, persistence, reconciliation
        create-checkout     — Stripe Checkout for pro | team | apex_dogfood
        stripe-webhook      — verified, idempotent event ingestion
        billing-diagnostics — non-secret configuration readout

External: api.github.com · raw.githubusercontent.com · registry.npmjs.org · pypi.org · Stripe
```

## The scan path

```
scan request (UI → scan-repository)
  → scan record (scans row, status advances per phase)
  → source ingestion (github.ts: fixed hosts, validated owner/repo, size limits, tree listing)
  → runScanPipeline (packages/provenance-core, runtime-agnostic)
       normalize (lexical on the edge; tree-sitter in Node)
       fingerprint (Winnowing)
       candidate discovery + comparison through SimilarityProviders
       license context (manifests, license files, npm/PyPI)
       finding drafts with stable finding_keys, bands, excerpts, coverage
  → findings persisted (scan_findings, as the caller — RLS applies)
  → reconciliation (sync_tracked_findings, service role)
       new → detected · resolved-and-back → reopened · fix recorded but still seen →
       rescan_still_detected · re-checked and gone → rescan_clean (resolved)
  → UI: scan page, finding page, dashboard, history
```

The Edge Function owns only runtime-specific concerns (auth, the ingestion boundary,
persistence). Everything else is `runScanPipeline`, which the public demo, the Lattice seed
script, and the test suite call directly. That is what keeps scanning portable.

## Similarity providers

`packages/provenance-core/src/scanner/providers/types.ts`:

```ts
interface SimilarityProvider {
  id: string;
  describeCoverage(): ProviderCoverage;           // honest claim + limitations, shown on findings
  discoverCandidates(probe): Promise<Candidate[]>;  // cheap first stage (fingerprint index)
  compareCandidate(probe, candidate): Promise<Evidence | null>; // precise second stage
}
```

- `createStaticCorpusProvider` — an in-memory corpus with an inverted fingerprint index. It
  backs both live providers below and is the natural shape for a customer's private corpus.
- `createReferenceCorpusProvider` — **the only provider in real scans today**: PoryGen's
  bundled reference corpus (4 original reference implementations, v2026.1).
- The demo's `sample-corpus` provider — fictional sources, demo only.

Every finding's `evidence_json.provider` records the provider id, corpus, version, scope, and
its coverage claim. Planned providers — licensed source corpora, commercial source intelligence
(SCANOSS-class), GitHub candidate discovery, private enterprise corpora — plug in behind the same
interface. The resolution rules key off the provider that produced a finding, so swapping
providers never silently resolves anything (see [SCANNER.md](SCANNER.md#resolution-contract)).

## Where PoryGen fits

| Category | The question it answers |
|---|---|
| SCA / SBOM / source intelligence (JFrog, FOSSA, FossID, SCANOSS) | Does this resemble known open source, and what license applies? |
| Agent attribution (AgentDiff, Agent Trace, git-ai-style tooling) | Which agent introduced this code? |
| Technical due diligence | What risk exists in this codebase today? |
| **PoryGen** | Continuously check the code AI-assisted teams ship, show suspicious ancestry and license context, help resolve it, verify the fix, and keep the resolution history. |

Distinctive by design: vendor-independent, Git-centered, useful without agent attribution,
similarity and license context in one workflow, remediation-first, continuous rather than
one-off, founder-usable without a security program.

## Frontend

```
src/
  config/        plans.ts (all commercial plan data) · apexDogfood.ts (operator SKU) · site.ts
  components/    AppShell, MarketingNav, Footer, CodeCompare, EvidenceList, ResolutionTimeline,
                 Tags, Picture, Scrawl, BitCritter (secondary, in-app only)
  features/
    marketing/   landing, how it works, pricing, security, docs, 404
    demo/        public /demo: sampleRepo, sampleEngine (real pipeline), DemoPage
    dashboard/   "Your codebase today"
    findings/    findings list, finding page, evidence view-model
    scanner/     scan progress + results
    history/     resolution history + optional editor attribution
    repositories/, reports/ (evidence export), billing/, settings/, auth/
  lib/           api.ts (all Supabase calls) · dbTypes · resolution (UI model) ·
                 findingVocabulary · entitlements (plan derivation) · format
  styles/        tokens · fonts · global · layout · app
```

Routes other than `/` are code-split. `/demo` needs no account and no backend.

## Evolving the scanner

The synchronous Edge Function is right for the MVP and the free tier: it is bounded (40 files)
and finishes in seconds. Continuous monitoring and larger repositories need longer jobs. The
intended path, without new infrastructure:

1. **Queue in Postgres.** `scans` already behaves as a job record (`status`, timestamps,
   `error_code`). Add `claimed_by` / `claimed_at` / `attempts` columns and claim jobs with
   `select … for update skip locked`.
2. **Worker.** A Node worker (Supabase-adjacent container or a scheduled function) that runs
   `runScanPipeline` with the **tree-sitter** normalizer and a full `git` checkout instead of
   the 40-file sample, writing through the same tables and calling the same
   `sync_tracked_findings`.
3. **Triggers.** A GitHub App webhook (push / pull_request) inserts `queued` scans; PR status
   checks read the resulting risk level.
4. **Customer-controlled environments.** The same package runs in CI or on-prem; results post
   back through an authenticated endpoint that calls `sync_tracked_findings`.

None of this is built. Nothing in the current code needs Redis, Kafka, or a separate cloud.

## Stripe and APEX

`create-checkout` sells two distinct things: monthly subscriptions (`pro`, `team`) whose Price
IDs come from `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_TEAM_MONTHLY`, and the APEX dogfood
one-time SKU (`apex_dogfood`). Unconfigured plans fail closed. `stripe-webhook` is the only
writer of payment state; the app derives a customer's plan from verified webhook rows only, and
APEX test purchases never grant a plan. See [STRIPE_SETUP.md](STRIPE_SETUP.md) and
[APEX_DOGFOOD.md](APEX_DOGFOOD.md).
