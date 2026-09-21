# Scanner

The scanner is an engine inside the product, not the product. Everything here can be improved
or replaced — normalizer, fingerprinting parameters, providers, corpora — without changing what
a customer does with a finding.

## Pipeline

`packages/provenance-core/src/scanner/pipeline.ts` — `runScanPipeline(input)`:

```
index        code files vs. manifests / license files / docs
normalize    lexical (default) or tree-sitter tokens per code file
fingerprint  Winnowing over normalized tokens
compare      discover → compare through each SimilarityProvider, band each match
licenses     license files + dependency manifests, registry lookups, SPDX policy
findings     drafts with finding_key, band, severity, evidence, excerpts, remediation
summary      coverage, providersRun, checkedPaths, ingestedPaths, manifestsChecked,
             evaluatedFindingTypes, findingsTruncated, per-file similarity counts, SBOM
```

It is runtime-agnostic (browser, Node, Deno). `onPhase` callbacks let the caller persist
progress; `scan-repository` writes each phase to `scans.status`. Ingestion and persistence stay
with the caller.

Callers today: the `scan-repository` Edge Function (vendored copy under `_shared/`, regenerated
by `scripts/sync-vendored-copies.mjs`), the public `/demo` (in the browser), the Lattice seed
generator, and the test suite (including a tree-sitter run).

## Normalization

- **Lexical** (`lexicalNormalize.ts`) — dependency-free tokenizer. Comments and literal values
  vanish, non-keyword identifiers collapse to `ID`, keywords and punctuation survive. Renaming
  or reformatting doesn't change the token stream. Runs everywhere, including the Edge Function.
- **Tree-sitter** (`treeSitterNormalize.ts`) — real `web-tree-sitter` grammars for JavaScript,
  TypeScript, and Python; named syntax nodes become tokens. Node-only (reads WASM grammars from
  disk). This is the preferred path for a worker, CI, or local run — `pipeline.test.ts` runs the
  full pipeline and the reference provider on it.

Providers fingerprint their candidates with the same normalizer as the probe, so the two paths
never compare unlike token streams.

**Why lexical on the edge:** bundling tree-sitter's WASM runtime and grammars (0.5–2.3 MB each)
into a cold-start-sensitive Deno function wasn't worth it for a 40-file scan. The swap is
contained: pass a different `normalizer` to `runScanPipeline`.

## Winnowing

`winnow.ts` implements Schleimer, Wilkerson & Aiken (2003): FNV-1a hashes of `k = 5` token
k-grams, then the minimum hash in each window of `w = 4` (rightmost on ties). Any shared run of
`k + w − 1 = 8` tokens is guaranteed to produce a shared fingerprint.

`similarity.ts` maps shared fingerprints back to **line ranges on both sides** (each
fingerprint's k-gram spans known token lines), merges adjacent ranges, and computes
**containment** = shared ÷ candidate fingerprints.

## Bands and thresholds

| Band | Rule | Persisted severity |
|---|---|---|
| Clear | containment < 55% | not a finding |
| Common pattern | ≥ 55%, candidate is a known idiom **and** permissively licensed | `info` (never tracked) |
| Review suggested | 55% – 85% | `review` |
| Strong source match | ≥ 85% | `review`, or `blocking` when the source's license is strong copyleft |

Each similarity finding stores `evidence_json`: `band`, `why` (a plain sentence), `provider`
(id, name, corpus, version, scope, coverage claim), `candidate` (title, license, policy,
origin), `containment`, fingerprint counts, `probeLines` / `candidateLines`, `probeExcerpt`
(at most 40 lines / 4,000 characters of the matched region of the scanned file),
`candidateExcerpt` (only when the provider may redistribute it), and `normalizer`. Legacy keys
(`corpusEntryId`, `corpusEntryLicense`, `note`) are kept for older readers.

The product never says "copied" or "stolen"; the words are *strong source match*, *possible
source match*, and *review suggested*.

## Providers and coverage

See [ARCHITECTURE.md](ARCHITECTURE.md#similarity-providers) for the interface.

| Provider | Scope | Status |
|---|---|---|
| `porygen-reference-corpus` | 4 original reference implementations (debounce, deepClone, quicksort, withRetry), each with an assigned reference license, v2026.1 | **Live — the only provider in real scans** |
| `sample-corpus` | 3 fictional "public" files for `/demo` | Demo only |
| Licensed source corpora | Large licensed bodies of public source | Planned |
| Commercial source intelligence | SCANOSS-class services | Planned |
| GitHub candidate discovery | Candidate search over public repositories, then precise comparison | Planned |
| Private corpus | A company's or client's own code | Planned |

**What this means honestly:** the matching engine is real and tested; the coverage is a small
demonstration corpus. A clear result today means "nothing matched PoryGen's reference corpus",
not "this code is original". Marketing copy says "checks against known reference source" and
explicitly never claims an internet-wide search. The reference entries are original code written
for PoryGen, so a match means "structurally similar to this reference", not "resembles a
specific third-party project". Broader production coverage needs, at minimum: a licensed corpus
or source-intelligence provider, an index that isn't loaded into memory per request, and the
async worker described in [ARCHITECTURE.md](ARCHITECTURE.md#evolving-the-scanner).

## Resolution contract

`sync_tracked_findings` (see [DATA_MODEL.md](DATA_MODEL.md)) resolves a tracked finding only when
the new scan **provably re-checked it**:

- similarity finding — its file is in `summary.checkedPaths` **and** its provider is in
  `summary.providersRun` (a provider swap never resolves old findings);
- dependency license finding — dependency manifests were evaluated (`manifestsChecked`);
- license-file finding — the file is in `ingestedPaths`;
- any file finding — or the scanner reports the file is gone from a *complete* repository tree;
- never from a scan with `findingsTruncated: true`, and never for types the scan didn't evaluate.

This is why the pipeline records those summary fields, and why actionable findings are never
capped below 200 per scan.

## License scanner

`license.ts` detects license files by text signature and parses `package.json`,
`requirements.txt`, `go.mod`, and `Cargo.toml`. Registry lookups (npm, PyPI) resolve SPDX
expressions — `(MIT OR Apache-2.0)` takes the most permissive known option, `AND` takes the most
restrictive, `-only` / `-or-later` suffixes are stripped — plus npm license objects and PyPI
trove classifiers. Policy: permissive → CLEAR, weak copyleft → REVIEW, strong copyleft →
BLOCKING, unrecognised → UNKNOWN (surfaced as "License unknown", review suggested).

## Limits

- 40 files, 200 KB per file, 2 MB per scan on the edge; vendor/build directories skipped.
- Public GitHub repositories only (private needs the planned GitHub App).
- Lockfiles are recognised but not parsed for the transitive tree; direct dependencies only.
- Text source only; no binaries.
- Unknown-language files are tokenized without keyword awareness (weaker signal).
