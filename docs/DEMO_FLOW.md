# Demo flow

Scripted walkthrough of each acceptance scenario. All were exercised live against the
deployed Supabase project during this build except where noted.

## A — Public product

Open `/`. Bit-Critter hero, "Own your code. Prove your provenance.", terminal readout,
pipeline strip. Navigate `/product`, `/pricing`, `/enterprise`, `/docs` via the nav.
Pricing recomposes responsively; resize to 320px and confirm no horizontal overflow.

## B — Account

`/sign-up` → enter email/password → confirmation-email gate (real Supabase Auth
behavior; confirm via the Supabase dashboard or `email_confirmed_at` in a real deploy) →
`/sign-in` → session persists across a page refresh (verified: `supabase-js` restores
the session from `localStorage` on load) → sign out via the sidebar.

## C — Repository (real, live-tested)

Signed in → `/repositories/new` → paste a public GitHub URL (e.g.
`https://github.com/expressjs/cors`) → **Run scan**. Verified live: status progresses
`ingesting → indexing → normalizing_ast → fingerprinting → analyzing_licenses →
building_provenance_summary → complete`, terminal fills with real counts, 8 real
dependency license findings resolved via the npm registry, risk level `clear`.

## D — Deterministic demo (Lattice)

`/repositories` → **porygen/lattice** (tagged `DEMO`) → **view scan**. Shows the seeded,
deterministic scan: `blocking` risk, 4 findings —

- **A** — AGPL-3.0 dependency `lattice-forms`, `BLOCKING`.
- **B** — structural fingerprint match against the bundled `quicksort` corpus entry,
  `REVIEW`, confidence 100% (genuinely computed by `scripts/seed-lattice.ts` running the
  real winnowing pipeline over a renamed/reformatted probe — not hand-typed).
- **C** — AI-assisted 126-line insertion followed by human rework, `MIXED PROVENANCE`,
  `REVIEW`.
- **D** — MIT dependency `lattice-utils`, `CLEAR`.

## E — Provenance

`/provenance` (repository selector → porygen/lattice). Dual-column ledger: 26 seeded
events on the left (timestamp, source, file, tool, hash prefix), hash-chain state on the
right. **Chain intact · 26 events.** Composition tiles show the real percentage split
across `human`/`ai`/`imported`/`unknown` computed from the actual seeded events (not a
hardcoded number).

## F — Evidence

From a completed scan → **Export evidence** → `/scans/:id/evidence`. **Export evidence
(JSON)** downloads a file containing repository identity, scan metadata, all findings,
the CycloneDX SBOM, provenance summary/events, and hash-chain state. **print report**
opens the browser print dialog against a print-styled version of the same report. For a
`CLEAR`-risk scan with zero blocking findings, a **PoryGen Verified: Clear** panel
appears with copyable Markdown/HTML badge snippets.

## G — VS Code

```bash
cd packages/vscode-extension
npm install
npm run compile
```

Open the folder in VS Code, press F5 → Extension Development Host. Edit any file — events
append to `.porygen/provenance-ledger.jsonl` and stream to the **PoryGen Provenance**
output channel. `npm test` (from repo root or the package) runs
`test/classifier.test.ts` — deterministic classification verified via fixtures, no VS
Code API required.

## H — Billing

`/billing` → **Upgrade to Pro** → `create-checkout`. In this environment (no sandbox
Stripe key configured) this returns a clear `STRIPE_NOT_CONFIGURED` message rather than a
fake success state — verified live. With real sandbox credentials configured (see
[STRIPE_SETUP.md](STRIPE_SETUP.md)), the same code path creates a real Stripe Customer
and Checkout Session, redirects to Stripe, returns to `/billing/success`
(which explicitly does *not* claim payment succeeded until a webhook-confirmed
`billing_events` row exists), and `/billing/diagnostics` exposes every non-secret ID
needed to verify the chain manually.

## I — APEX dogfood readiness

`/billing/diagnostics` shows the configured (or explicitly missing) `STRIPE_PRO_PRICE_ID`
and `APEX_CUSTOMER_ID` — verified live as both reporting "not configured" in this
environment, with no fabricated values. [`docs/APEX_DOGFOOD.md`](APEX_DOGFOOD.md) gives
the operator the exact next steps and the attribution contract.

## J — Quality

```bash
npm install   # succeeds
npm run build # tsc -b && vite build — succeeds, 0 TypeScript errors
npm test      # vitest — 53/53 passing across provenance-core and vscode-extension
```

No dead primary navigation or CTA — every route in `src/App.tsx` resolves to a real page.
No secrets committed (`.env.local` gitignored, only `.env.example` tracked). Mobile
layout (320–768px) recomposes via the CSS in `src/styles/*.css` — pricing plate, ledger
columns, and app shell all have explicit narrow-viewport rules.
