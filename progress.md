# Progress

## Done

- Vite/React/TS app scaffolded, npm workspaces (`packages/provenance-core`,
  `packages/vscode-extension`).
- Design system: Hardware Brutalism × Cybernetic Familiar tokens, Bit-Critter SVG (6
  states, CSS-only autonomic motion, reduced-motion safe), marketing site (landing,
  product, pricing spec plate, enterprise schematic, docs index).
- Supabase project provisioned (`fxeuahfgwydwzflymsoy`), full schema + RLS applied,
  security-advisor-clean.
- Auth: real Supabase sign-up/in/out, session persistence, live-tested in browser.
- `scan-repository` Edge Function: real GitHub ingestion (SSRF-safe), lexical
  normalization, real Winnowing fingerprints, real npm/PyPI license lookups, CycloneDX
  SBOM — live-tested against `octocat/Hello-World` and `expressjs/cors` through the
  actual UI, not just curl.
- `create-checkout` / `stripe-webhook` / `billing-diagnostics` Edge Functions deployed;
  Stripe code real but untested end-to-end (no sandbox key in this environment) —
  `create-checkout` verified to fail closed with a clear `STRIPE_NOT_CONFIGURED` message.
- Dashboard, repositories, new-scan, scan-progress/results, finding-detail, provenance
  ledger, evidence bundle (JSON export + print report + Verified:Clear badge), billing
  status/diagnostics/success, settings — all wired to live Supabase data.
- Lattice demo project seeded deterministically (26 provenance events, 4 findings,
  1 genuinely-computed structural-fingerprint match). Seeding surfaced and fixed two real
  bugs in the hash-chain library (optional-field presence, Postgres timestamp format
  drift) — both covered by new regression tests.
- VS Code extension: compiles, real `onDidChangeTextDocument` capture, classifier tests
  pass via the root vitest suite.
- `packages/provenance-core`: 53/53 tests passing, including genuine tree-sitter parsing
  (`web-tree-sitter` + `tree-sitter-wasms`) as the reference normalizer.
- Full docs set (README, ARCHITECTURE, DATA_MODEL, SCANNER, PROVENANCE, STRIPE_SETUP,
  APEX_DOGFOOD, SECURITY, DEMO_FLOW, OPUS_HANDOFF).
- `npm run build` and `npm test` both clean.

## Known blockers (external credentials, not code)

- Stripe sandbox credentials (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_PRO_PRICE_ID`) and `APEX_CUSTOMER_ID` were not available in this environment —
  code path is real and deployed, just not exercised against a live payment. See
  docs/APEX_DOGFOOD.md for the exact next action.
- GitHub API calls run unauthenticated (no `GITHUB_TOKEN`) — works fine for the repos
  tested, but subject to GitHub's unauthenticated rate limit under heavier use.

## Deliberately out of scope

- Enterprise-tier infrastructure (large reference corpus, semantic clone detection,
  DOM/UI similarity, private deployment) — architecture documented, not built, always
  labeled "Enterprise preview."
- Sigstore signing — adapter ready, no real OIDC credential in this environment.
- VS Code extension Marketplace packaging (`vsce package`) — extension builds and runs in
  an Extension Development Host, which is what the spec asked for.
