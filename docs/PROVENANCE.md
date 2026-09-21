# Provenance

## Event taxonomy

Canonical `source_type` (five buckets, per the data model): `human`, `ai`, `imported`,
`generated`, `unknown`. Canonical `actor_type`: `developer`, `assistant`, `automation`,
`external`.

The VS Code extension's classifier produces a finer-grained `ClassifiedSignal` —
`human_signal`, `bulk_insert_signal`, `ai_assisted_signal`, `human_modified_ai`,
`imported`, `unknown` — which maps down to a canonical `source_type` for storage, with
the original classifier signal preserved in `metadata_json.classifierSignal` so the
finer distinction (e.g. "this human edit substantially reworked an earlier AI
insertion") isn't lost.

## Classifier heuristics

`packages/provenance-core/src/provenance/classifier.ts`, `classifyEdit()`. Reads shape —
size, speed, whether the change replaced existing text — never content:

- **Bulk burst**: ≥8 lines inserted in one change, ≤400ms since the previous event in
  that file → `ai_assisted_signal` (or `human_modified_ai` if it replaced existing text).
- **Large first-shot paste**: ≥400 chars with no timing precedent → `imported`.
- **Human cadence**: 1–40 chars, ≥150ms since the previous event → `human_signal` (or
  `human_modified_ai` if it replaced existing text).
- **Fast mid-size edit**: >40 chars, <150ms since the previous event → `ai_assisted_signal`
  (lower confidence than a bulk burst).
- Anything else → `unknown`.

All five thresholds are `ClassifierConfig` fields (`porygen.classifier.*` VS Code
settings), never hidden constants. This is heuristic, not detection — see
[Legal claim boundary](#legal-claim-boundary).

## Hash chain

`packages/provenance-core/src/provenance/events.ts`. Each event's `eventHash` commits to
a **canonical, fully-normalized** shape of its own fields plus the previous event's hash
(`canonicalEventShape` → `canonicalize` → SHA-256, via Web Crypto — one implementation,
runs identically in the browser, Node, and Deno).

Two normalization rules exist specifically because this chain is verified after a
database round-trip, not just at write time (both were real bugs, caught seeding the
Lattice fixture, both covered by regression tests in `events.test.ts`):

1. **Optional-field presence.** A freshly-built `ProvenanceEventInput` literal may omit
   `parentEventId`/`diffHash` entirely; a row read back from Postgres always has the
   column, `null` or not. `canonicalEventShape` defaults every optional field to `null`
   explicitly, so hashing is independent of which optional keys a given writer happened
   to include.
2. **Timestamp string format.** Postgres renders `timestamptz` as
   `"2026-09-15 09:02:00+00"`; this library writes ISO-8601
   (`"2026-09-15T09:02:00.000Z"`). Same instant, different string. `canonicalEventShape`
   re-parses `eventTimestamp` through `new Date(...).toISOString()` before hashing, so
   verification hashes the instant, not its spelling.

`verifyChain()` recomputes every hash and reports the first break — tamper-evident:
editing or removing any past event changes every hash after it.

## In-toto format

`buildInTotoStatement()` produces an `https://in-toto.io/Statement/v1`-shaped payload:
`subject` (repository name + content-hash digest), `predicateType`
(`https://porygen.dev/attestation/v1`), and a `predicate` carrying the scan ID, policy
version, chain-verification result, and first/last event hashes.

## Sigstore boundary

`packages/provenance-core/src/provenance/sigstore.ts`. `UnavailableSigstoreSigner` is the
only signer wired up in this build — there is no OIDC identity token configured in this
environment. Every attestation surfaced in the UI is labeled exactly what it is:
**"local hash-chain attestation"** or **"unsigned in-toto statement."** The adapter
(`SigstoreSigner` interface, `attestationStatusFor()`) is ready: swap in a real
`sigstore`-npm-package-backed signer once genuine OIDC credentials exist, and every
downstream reader already branches on `attestationStatusFor()` rather than assuming a
signature exists.

## Legal claim boundary

- An observed provenance composition is evidence about editing patterns, **not** a legal
  determination of copyright ownership or authorship.
- A structural-fingerprint match is evidence of similarity against a configured
  reference corpus, **not** proof of infringement.
- The classifier's signals are heuristics about edit *shape* — size, speed, replacement —
  **never** a claim to have detected AI-generated content from its content.
- "Chain intact" means the stored hash chain recomputes cleanly — a tamper-evidence
  check, **not** third-party cryptographic notarization (that's exactly what the Sigstore
  boundary above is honest about not having, in this environment).
