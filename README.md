# PoryGen

**Own your code. Prove your provenance.**

PoryGen records how software was created, identifies risky code ancestry, and turns
AI-assisted development into an auditable evidence trail. It is a provenance-evidence
platform, not a legal certification authority — see [claim boundaries](#claim-boundaries).

## What's real vs. simulated

| Surface | Status |
|---|---|
| Marketing site (landing, product, pricing, enterprise, docs) | Real |
| Auth (sign up, sign in, session persistence, sign out) | Real — Supabase Auth |
| Repository feed + real GitHub scan | Real — `scan-repository` Edge Function, live-tested against `expressjs/cors`, `octocat/Hello-World` |
| Scanner (tokenize → AST-normalize → winnow → fingerprint) | Real — Winnowing algorithm, tested; edge deployment uses a lexical normalizer (see [docs/SCANNER.md](docs/SCANNER.md)); a genuine tree-sitter reference path exists and is tested for Node contexts |
| License scanner | Real — npm/PyPI registry lookups, SPDX policy mapping |
| Findings, scan results, finding detail | Real, persisted to Postgres via RLS |
| Provenance ledger + hash chain | Real hashing/verification; **Lattice** project's 26 events are seeded, deterministic fixtures — a fresh GitHub scan has no ledger yet until the VS Code extension captures edits |
| Evidence export (JSON + print report) | Real |
| Verified: Clear badge | Real generation, snapshot-based |
| VS Code provenance capture extension | Real, compiles, tested classifier |
| Stripe Checkout / webhook | Real code path; **not exercised end-to-end** — no sandbox `STRIPE_SECRET_KEY` was available in this build. See [docs/STRIPE_SETUP.md](docs/STRIPE_SETUP.md) |
| Sigstore attestation signing | Not implemented — explicit "local hash-chain attestation" fallback, adapter ready. See [docs/PROVENANCE.md](docs/PROVENANCE.md) |
| Enterprise-tier infrastructure (large corpus, semantic clone, DOM review, private deployment) | Not built — labeled "Enterprise preview" everywhere it appears |

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

```bash
npm test    # vitest — scanner, provenance, classifier, all workspaces
npm run build
```

## Environment variables

See [.env.example](.env.example). Frontend variables (`VITE_*`) are safe to expose — the
publishable key is only ever as powerful as the RLS policies in `supabase/migrations`
allow. Everything else (`STRIPE_*`, `APEX_CUSTOMER_ID`, `GITHUB_TOKEN`) is an Edge
Function secret, set via `supabase secrets set`, never bundled into the browser build.

## Supabase setup

Migrations live in `supabase/migrations/` (schema, RLS policies). Edge Functions live in
`supabase/functions/`. This build provisioned a live project and applied everything via
the Supabase MCP tooling — for a fresh project:

```bash
supabase link --project-ref <ref>
supabase db push
supabase functions deploy scan-repository create-checkout stripe-webhook billing-diagnostics
```

`scan-repository`'s scanner logic is vendored from `packages/provenance-core` — run
`node scripts/sync-vendored-copies.mjs` after touching scanner/provenance source before
redeploying.

## Stripe setup

See [docs/STRIPE_SETUP.md](docs/STRIPE_SETUP.md).

## Scanner support

Tree-sitter grammars: JavaScript, TypeScript, Python (Node/test path). Lexical
normalizer (edge deployment): the same three languages by extension, plus fallback
tokenization for anything else. See [docs/SCANNER.md](docs/SCANNER.md) for the full
pipeline, the Winnowing algorithm, and the reference-corpus boundary.

## VS Code extension

`packages/vscode-extension` — see its own [README](packages/vscode-extension/README.md).

## Demo walkthrough

See [docs/DEMO_FLOW.md](docs/DEMO_FLOW.md) for the scripted walkthrough of every
acceptance scenario.

## Deployment

Frontend: any static host serving the Vite build (`npm run build` → `dist/`).
Backend: Supabase project (Postgres + Auth + Edge Functions), already provisioned for
this build. No server process to deploy — Edge Functions run on Supabase's own runtime.

## Known limitations

- The `scan-repository` Edge Function uses a dependency-free lexical normalizer, not full
  tree-sitter parsing, to avoid bundling multi-megabyte WASM grammars into a cold-start-
  sensitive Deno function. See [docs/SCANNER.md](docs/SCANNER.md) for the honest boundary
  and the tested tree-sitter reference implementation.
- Provenance events only exist for repositories with VS Code-extension capture history
  (or the seeded Lattice fixture) — a freshly-fed GitHub repository has an empty ledger.
- Sigstore signing is not wired to a real OIDC credential in this environment; every
  attestation is explicitly labeled "local hash-chain attestation" or "unsigned in-toto
  statement," never claimed as signed.
- Stripe Checkout/webhook code is real but untested end-to-end — no sandbox credentials
  were available. See [docs/APEX_DOGFOOD.md](docs/APEX_DOGFOOD.md) for the next action
  required to complete that path.
- Enterprise-tier capabilities (large-corpus fingerprinting, semantic clone detection, UI/
  DOM similarity, private deployment) are architecture only, visibly labeled
  "Enterprise preview."

## Claim boundaries

PoryGen produces provenance **evidence**, not legal certification. An observed
provenance composition is evidence about editing patterns, not a legal determination of
copyright ownership. A structural-fingerprint match is evidence of code similarity
against a *configured reference corpus*, not proof of infringement, and never a claim to
have searched the entire internet. A license-policy finding identifies a likely
obligation for review — it is not legal advice. "PoryGen Verified: Clear" means no
blocking findings were detected under the selected policy at the recorded scan time; it
is explicitly snapshot-based, never a perpetual certification.
