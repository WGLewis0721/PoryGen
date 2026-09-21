# History and evidence

PoryGen's long-term value is a record of what was checked, flagged, fixed, and confirmed. It is
a consequence of daily use, not the pitch, and the UI calls it **Resolution history**. Earlier
builds led with provenance, AI-authorship percentages, and "chain of title"; those capabilities
remain underneath, repositioned here.

## Resolution history (primary)

`tracked_findings` + `finding_resolutions` — see [DATA_MODEL.md](DATA_MODEL.md). Every finding
worth a look carries an append-only history: detected → review started → fix recorded → clean
rescan (resolved), or accepted risk / dismissed as a false positive with a required reason, or
reopened when a resolved finding comes back. System steps are written only by scan
reconciliation; people can't resolve findings themselves.

Surfaces: the finding page ("Did the fix pass?"), the dashboard's recent activity, `/history`,
and the evidence export.

## Evidence export

`/scans/:id/evidence` — a JSON download and a print summary containing the repository and scan
identity, coverage (which providers and corpora the scan compared against), findings with their
evidence, the repository's resolution history, the CycloneDX dependency inventory, and any
editor-attribution events with their hash-chain state. It ends with the claim boundary below.
The Diligence Pack is this export, frozen and assembled on request. The previous "PoryGen
Verified: Clear" badge snippet was removed: it pointed at a badge service that doesn't exist and
read like a certification.

## Editor attribution (optional)

The VS Code extension (`packages/vscode-extension`) records the **shape** of edits — size,
timing, whether text was replaced — never content, and classifies each into a signal
(`human_signal`, `bulk_insert_signal`, `ai_assisted_signal`, `human_modified_ai`, `imported`,
`unknown`), stored as a canonical `source_type` with the original signal in `metadata_json`.
PoryGen works without it; Git and scans are the universal path. It lives under
History → Editor attribution and never appears as a headline "% AI" metric.

### Classifier heuristics

`packages/provenance-core/src/provenance/classifier.ts` (`classifyEdit()`), all thresholds
configurable via `porygen.classifier.*`:

- **Bulk burst** — ≥ 8 lines in one change, ≤ 400 ms after the previous event → `ai_assisted_signal`
  (or `human_modified_ai` when it replaced text).
- **Large first-shot paste** — ≥ 400 chars without timing precedent → `imported`.
- **Human cadence** — 1–40 chars, ≥ 150 ms apart → `human_signal`.
- **Fast mid-size edit** — > 40 chars, < 150 ms apart → `ai_assisted_signal` (lower confidence).
- Anything else → `unknown`.

### Hash chain

`provenance/events.ts`: each event's hash commits to its canonical fields plus the previous hash
(SHA-256 via Web Crypto). Optional fields default to `null` and timestamps are re-serialized
before hashing, so verification survives a Postgres round-trip (both were real bugs, covered by
tests). `verifyChain()` reports the first break. `buildInTotoStatement()` produces an
`https://in-toto.io/Statement/v1`-shaped payload.

### Sigstore boundary

`provenance/sigstore.ts` — only `UnavailableSigstoreSigner` is wired (no OIDC credential).
Attestations are labelled "local hash-chain attestation" / "unsigned in-toto statement" and never
claimed as signed.

## Claim boundary

- Similarity findings are evidence for review, not proof of copying or infringement.
- Coverage is limited to the sources each scan compared against — today PoryGen's reference
  corpus — never the entire internet.
- License context describes what a license family usually requires; it isn't legal advice.
- The resolution history records what was checked and decided; it doesn't certify originality.
- Editor attribution is a heuristic about edit shape, not a determination of authorship.
- "Hash chain intact" means the stored chain recomputes cleanly — tamper evidence, not
  third-party notarization.
