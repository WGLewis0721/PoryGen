# PoryGen Source Search Lab V2

A small, readable experiment for the candidate-discovery technology PoryGen needs between **Scan** and an actionable finding.

It is isolated from production PoryGen. It does not change billing, authentication, Supabase schemas, or the production scanner.

## Experience

```
public GitHub repo URL
→ resolve current commit
→ fetch bounded JS / TS / Python source
→ split code into overlapping token regions
→ identifier-preserving fingerprints
   + identifier-normalized fingerprints
→ retrieve a shortlist from a prebuilt public-code index
→ downweight fingerprints common across the corpus
→ verify ordered token matches and contiguous spans
→ show evidence
→ Review source / Dismiss / Rescan
```

There is one repository input and one **Scan** button. No manual query, provider picker, package install, or repository code execution is involved.

## Current reference coverage

The committed V2 index contains **6 pinned source files from 3 public repositories**:

- `sindresorhus/yocto-queue` — JavaScript — MIT
- `date-fns/date-fns` — TypeScript — MIT
- `psf/requests` — Python — Apache-2.0

Exact commits, blob SHAs, paths, and license links are in `config/reference-sources.json`.

This is intentionally tiny. A missing finding means only:

> Nothing sufficiently strong was found in these indexed sources.

It does not mean the code is original.

## Run

Requires Node 20+.

```bash
cd labs/source-search-lab
npm test
npm start
```

Open:

```text
http://localhost:3000
```

Try the live public fixture:

```text
https://github.com/sindresorhus/yocto-queue
```

An optional `GITHUB_TOKEN` raises GitHub API rate limits:

```bash
export GITHUB_TOKEN="..."
npm start
```

## Rebuild the public reference index

The customer scan does **not** rebuild the reference corpus.

To reproduce the checked-in index from its pinned public sources:

```bash
npm run build:index
```

The builder verifies each configured blob SHA, fetches only those public blobs, and writes `data/reference-index.json`.

## Scan limits

V2 intentionally has conservative limits:

- public GitHub repositories only;
- JavaScript, TypeScript, and Python;
- maximum 40 fetched source files;
- maximum 100 KB per source file;
- maximum 750 KB fetched source per scan;
- approximately 15 seconds allowed for GitHub retrieval;
- generated/vendor/build directories are skipped;
- GitHub tree truncation, file limits, provider failures, and skipped files are surfaced as partial-scan information.

Repository code is **never executed**. The lab does not install dependencies or invoke repository scripts.

## Matching

The index and customer regions each use two representations:

1. identifier-preserving tokens;
2. identifier-normalized tokens, where developer-chosen names collapse to `ID`.

Both are shingled and Winnowed. Candidate lists are combined, with fingerprints appearing in much of the small corpus downweighted. Each region is bounded to roughly 20 candidates before the more expensive ordered comparison.

### Reporting gate

Retrieval stays broad — every shortlisted candidate is verified independently, and a
file can legitimately produce zero, one, or several findings against different
public sources. Reporting is deliberately conservative:

- **Structural overlap** (identifier-normalized ordered/contiguous matching tokens
  and coverage) shows two regions have the same *shape*. Shared shape alone —
  common loops, common guard clauses, common framework idioms — is true of a huge
  amount of unrelated code and is never enough by itself to name a source.
- **Specific evidence** requires the match to survive when identifiers and
  literals must be spelled exactly the same, or to include a handful of rare
  7-token fingerprints that are not common across the indexed corpus. This is
  what actually ties a region to *one* public source rather than to a pattern
  many sources share.
- A candidate only becomes a customer-facing **strong match** when it clears the
  structural bar *and* the specific-evidence bar *and* is not dominated by
  fingerprints that recur across much of the indexed corpus.
- Each candidate document is judged independently, so two, three, or more public
  sources can each earn a strong match on the same file. There is no "only the
  top candidate can win" rule.
- Overlapping scan windows that resolve to the same customer region and the same
  public source collapse into one finding with the best evidence, not one card
  per window.
- Normalized structural similarity **alone is never sufficient** for a strong
  match. A no-match scan — "no sufficiently specific source match found in the
  indexed corpus" — is a normal, successful result, not a failure.

### Literal handling

The two representations intentionally treat literals differently:

- the **identifier-preserving** representation keeps the exact lexical spelling of string, template, and numeric literals as a token signal, so `"safe"` and `"unsafe"` are distinguishable during precise retrieval;
- the **identifier-normalized** representation collapses all supported literals to `LIT`, so changing a string or numeric constant does not destroy structural similarity;
- JavaScript/TypeScript template literals are treated as one lexical literal token in this lightweight lab; interpolation expressions inside a template are not parsed separately;
- Python single-, double-, and triple-quoted strings are treated as literal tokens. Python string-prefix semantics such as `f`, `r`, and `b` are not fully parsed by this dependency-free tokenizer.

### JavaScript / TypeScript compatibility

JavaScript and TypeScript are treated as one compatible retrieval family. A `.ts` or `.tsx` customer region may match an indexed JavaScript source, and a JavaScript customer region may match an indexed TypeScript source. Python remains isolated to Python candidates.

Compatibility filtering happens **before** the shortlist is ranked so incompatible-language postings cannot consume the approximately 20 candidate slots.

The verifier reports:

- customer line range;
- public-source line range;
- side-by-side excerpts;
- customer-region coverage;
- source-region coverage;
- ordered matched-token count;
- longest contiguous matching block;
- pinned source URL;
- available license metadata.

Starting thresholds are experimental:

- structural: 24 ordered matching tokens, a 12-token contiguous block, 60% coverage of the smaller comparison side;
- specific evidence (identifier/literal-exact): 18 ordered matching tokens, a 9-token contiguous run, or 3 rare preserving fingerprints;
- a strong match requires both bars plus low corpus-wide commonality.

Those numbers are **not confidence percentages**.

## Classifications

- **Strong match** — source-specific evidence is substantial enough to justify surfacing this public source for review.
- **Possible / common pattern** — there is meaningful similarity, but it may be explained by common implementation structure or insufficiently unique evidence.
- **Insufficient evidence** — nothing in the indexed corpus is specific enough to attribute confidently.

Never claim proof of copying, proof of plagiarism, AI authorship, or exhaustive source coverage.

Similarity is never presented as proof of copying or AI authorship.

## Actions

- **Review source** opens the matching public source pinned to its commit and matched lines.
- **Dismiss** records a reason only in the page's in-memory JavaScript state. It is not written to a database or browser storage.
- **Rescan** resolves the repository's current commit again and shows whether prior findings remain or disappear.

## Privacy

Scan requests use POST and responses use `Cache-Control: no-store`.

Customer source and customer-derived fingerprints exist only during the scan in application memory. They are not written into the reference index, database, logs, public search engines, or an LLM provider.

The reference index contains public source only.

See `SECURITY.md`.

## Tests

```bash
npm test
```

The default suite covers exact matches, identifier renames, literal-only changes, formatting changes, partial fragments, mixed files with multiple independent public sources, common/framework patterns, independently written implementations of the same algorithm, normalized-high/preserving-low false positives, overlapping-window de-duplication, absent sources, bounded retrieval, separate coverage metrics, GitHub file limits and provider failures, index freshness, partial-rescan resolution, deleted-file resolution, POST/no-store, and the one-click scan flow.

A live network fixture is separate:

```bash
npm run test:public
```

It scans `sindresorhus/yocto-queue` from GitHub and verifies that the prebuilt index finds its pinned `index.js`.

See `RESULTS_V2.md` for measured validation.

## Remaining limitations

This is still a lab:

- six indexed files are nowhere near useful public-code coverage;
- the normalizer is dependency-free lexical analysis, not a full parser;
- ordered verification uses token-sequence comparison rather than a real AST/control-flow graph;
- GitHub API latency dominates tiny local matching times;
- public repositories only;
- thresholds need calibration on a much larger held-out corpus;
- no durable dismissal/history workflow;
- no production queue, worker, auth, entitlement, or database integration.

The purpose of V2 is to make the fundamental service loop real and measurable before scaling the corpus or moving it behind PoryGen's production `SimilarityProvider` interface.
