# Scanner

## Production scanner

The production scanner is the existing Source Search V2 / PoryGen Engine path exposed through POST /api/scan.

Customer input can come from:

- a public GitHub repository;
- an uploaded ZIP;
- browser-selected local project files.

These are ingestion modes, not separate matchers.

Main implementation areas:

\`\`\`
api/scan.mjs
labs/source-search-lab/
  lib/github-source.mjs
  lib/upload-source.mjs
  lib/upload-service.mjs
  lib/upload-worker.mjs
  lib/ingestion-policy.mjs
  lib/scan-service.mjs
  lib/search.mjs
  data/reference-index.json
packages/source-index/
\`\`\`

## Request flow

\`\`\`
GitHub / ZIP / local files
  → validate source input
  → select safe supported source files
  → apply user exclusions
  → tokenize
  → fingerprint
  → retrieve indexed candidates
  → verify candidates
  → report strong / possible-common / abstain
\`\`\`

The engine never executes customer code.

## Supported languages

- JavaScript
- TypeScript
- Python

JS/TS are treated as compatible for candidate matching. Python remains in its language family.

## Token representations

### Preserving

Keeps identifier and literal spelling and provides source-specific evidence.

### Normalized

Collapses identifiers/literals while preserving structural tokens so candidate retrieval tolerates renaming, formatting and some literal changes.

Normalized structure is useful for finding candidates; it is not sufficient by itself for strong source attribution.

## Fingerprinting and retrieval

Core behavior includes:

- 7-token shingles;
- Winnowing fingerprints;
- bounded candidate shortlists;
- corpus-common fingerprint suppression/downweighting;
- rarity/frequency signals;
- stable per-candidate retrieval accounting.

The production package corpus is hydrated from pinned source archives at build time.

## Verification and reporting

Candidates are verified with ordered/contiguous evidence.

Evidence can include:

- matched token counts;
- longest contiguous runs;
- customer/source coverage;
- preserving-token evidence;
- rare preserving fingerprints;
- customer/source line ranges;
- excerpts.

Strong findings require source-specific evidence in addition to normalized structural similarity.

Current calibrated strong behavior includes the existing source-specific contiguous/rarity gate; do not loosen it casually.

PR #21 adds an explicit regression guardrail: conventional one-line or broadly reused code patterns must not be promoted to `strong_match` from normalized/structural overlap alone. They require stronger source-specific lexical evidence. This is a production rule, not a benchmark-only preference.

Outcomes:

**Strong match**  
Specific enough to name the indexed public source for review.

**Possible / common pattern**  
Meaningful similarity exists, but the evidence may be ordinary/common or insufficiently unique.

**Insufficient evidence / abstention**  
Nothing is specific enough to justify naming a source.

Multiple sources may independently qualify. The Engine does not force one winner.

The Source Match contract carried forward from V2 is:

1. use preserving and normalized representations to retrieve a bounded candidate set;
2. verify candidates with ordered/contiguous evidence rather than a single similarity score;
3. retain matched customer/source line ranges and pinned source metadata;
4. distinguish strong evidence from possible/common-pattern evidence;
5. abstain when specificity is insufficient;
6. carry scan coverage/completeness into the customer result so a no-match result is scoped to what was actually checked.

## Corpus

Offline corpus pipeline:

- 50,633 files;
- 1,017 packages/projects;
- 48,711 unique blobs;
- 48,633 deduplicated clusters.

Production corpus pack:

- 1,000 canonical package-source files;
- 199 popular npm/PyPI packages.

The small pinned V2 reference index remains for documented fixtures/regressions.

A clean result means no sufficiently specific match was found in the indexed sources actually searched. It does not mean the code is original.

## GitHub ingestion

The GitHub path validates public GitHub repository references, resolves the latest default-branch commit/tree, selects supported files and fetches source from approved GitHub hosts.

Provider-specific HTTP behavior is normalized at the GitHub adapter boundary before downstream scan/report logic consumes it. A resolved source now carries an explicit tagged revision state:

- `{ kind: "git_commit", sha, treeSha, url? }`
- `{ kind: "none", reason: "empty_repository" }`

GitHub's explicit HTTP 409 `Git Repository is empty.` response is the only commit-resolution conflict promoted to the known-empty state. Generic 409s, 404s, rate limits, malformed success bodies, provider failures and timeouts remain failures/unknown states. Unknown is never treated as known empty.

For compatibility, existing `commit` and `commitUrl` fields remain present. New consumers should prefer the tagged revision state.

See [GITHUB_INGESTION_CONTRACT.md](GITHUB_INGESTION_CONTRACT.md) for the state machine, invariants and test partitions.

A server-side GITHUB_TOKEN may increase REST capacity.

GitHub source is not executed or cloned for execution.

## ZIP ingestion

ZIP upload behavior is defined in [ZIP_SCAN_API.md](ZIP_SCAN_API.md).

Important properties:

- compressed-size bound;
- declared/actual expanded-size bounds;
- entry-count bound;
- no absolute/traversal paths;
- no symlink/special-file escapes;
- no duplicate paths;
- malformed/integrity failures rejected;
- suspicious compression rejected;
- nested archives ignored rather than unpacked;
- binaries/invalid UTF-8 skipped;
- dependencies/build/generated paths ignored;
- bounded worker time/concurrency;
- no source execution.

## Browser-selected file ingestion

Local folder selection sends project-relative files to the same API/source abstraction.

Client-side filtering avoids obviously unsupported/dependency files, but the server remains authoritative.

Folder path identity uses the submitted relative path, including the selected root folder when the browser provides it.

## Exclusions

User exclusions are exact relative file/folder paths, not globs.

A directory rule matches that directory and descendants without accidentally matching same-prefix siblings.

Exclusions happen before matching and are reported back in scan metadata.

Excluding a path does not resolve an earlier finding.

## Limits

Common source limits:

- 150 matched files;
- 100 KB/file;
- 2 MB accepted source.

ZIP limits:

- 2.9 MB compressed;
- 1,000 entries;
- 10 MB declared/expanded archive budget.

The request JSON envelope is bounded below Vercel's platform request ceiling.

See [ZIP_SCAN_API.md](ZIP_SCAN_API.md) for detailed limits/errors.

## Completeness

Completeness accounting is separate from the capped visible skipped-file details.

Production UI/result semantics after PR #21:

- zero eligible source files: **No eligible source files were scanned**;
- incomplete work: clearly label **Partial scan**;
- where available, show unchecked-file counts and reasons;
- no-match wording applies only to files actually checked and never implies the entire project was cleared.

Reasons can include:

- file too large;
- file limit;
- total-byte limit;
- provider failure;
- processing timeout;
- binary/unsupported source;
- upload ingestion omissions.

Intentional user exclusions are disclosed but should not be mislabeled as matcher failure.

## Privacy

Responses use no-store.

Customer code is held transiently for analysis and is not sent to a runtime LLM.

The server does not intentionally persist uploaded source.

The upload UI does not persist upload source, excerpts or complete upload scan results in localStorage/sessionStorage.

Public GitHub browser-local review/rescan state remains a separate behavior.

## Validation status

The Engine has regression coverage for retrieval, reporting, completeness, rescan safety, tokenizer behavior and index freshness.

ZIP/folder ingestion has focused security/API tests, and the merged multi-input release passed one real HTTP ZIP → ingestion → Engine → strong-match gate.

PR #21 added focused regressions for conventional one-line false elevation, zero-file GitHub behavior and partial-scan wording. Final production smoke passed on Apex, the `itsm-tier1-agent` zero-file repository, and a partial PoryGen repository scan.

PR #23 adds equivalence-class coverage around GitHub commit resolution: valid revision, explicit empty repository, unrelated 409, malformed successful commit payload, not-found and rate-limited provider states. The Source Match Report also verifies that known-empty repositories render an explicit no-revision statement rather than an invented commit.

Do not turn routine product work into broad matcher benchmarking. Reopen matcher research when production evidence identifies a concrete accuracy issue.

## Next scanner work

The **Source Match Report** is shipped as a local self-contained HTML export with browser Print/PDF support and no new hosted persistence.

PR #23 empty-repository hardening is merged and deployed. Scanner access now expands through MCP and CLI, followed by larger corpus retrieval and connected/continuous GitHub use.

See [../ROADMAP.md](../ROADMAP.md).
