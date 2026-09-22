# Source Provenance — Source Search Lab V2

This file records the external concepts, public-code corpus, and existing PoryGen code that informed V2.

## Provenance statement

**No third-party implementation source code was copied into the V2 search engine.**

V2's implementation was written for this lab. Third-party source code appears only in `data/reference-index.json` as an intentionally selected **public reference corpus**, with repository, commit, path, pinned source URL, and available license metadata.

The design reuses concepts already present in PoryGen production code without importing the production package into the lab.

---

## 1. PoryGen's existing provider architecture

Internal sources:

- `packages/provenance-core/src/scanner/providers/types.ts`
- `packages/provenance-core/src/scanner/providers/staticCorpus.ts`
- `packages/provenance-core/src/scanner/similarity.ts`

Existing design used:

- cheap `discoverCandidates(...)` stage;
- precise `compareCandidate(...)` stage;
- an inverted fingerprint index;
- explicit coverage claims;
- source-side and customer-side line ranges;
- similarity classifications that do not claim copying.

V2 mirrors that **two-stage architecture** while remaining isolated JavaScript under `labs/source-search-lab`.

V2 mapping:

- `lib/search.mjs:245-293` — candidate discovery.
- `lib/search.mjs:368-407` — precise candidate verification.
- `lib/search.mjs:420+` — file/region orchestration.

Classification: **direct internal design precedent**, not copied implementation.

---

## 2. Winnowing / document fingerprinting

Reference:

Saul Schleimer, Daniel S. Wilkerson, Alex Aiken, **“Winnowing: Local Algorithms for Document Fingerprinting.”**

https://theory.stanford.edu/~aiken/publications/papers/sigmod03.pdf

PoryGen already implements Winnowing in:

- `packages/provenance-core/src/scanner/winnow.ts`

V2 mapping:

- `lib/search.mjs:101-108` — deterministic FNV-1a hash.
- `lib/search.mjs:110-119` — token shingles.
- `lib/search.mjs:121-145` — rightmost-minimum Winnowing selection.

Classification: **algorithm/concept reference plus internal precedent**.

The V2 JavaScript was written specifically for the lab and was not copied from the paper.

---

## 3. Identifier normalization

Internal reference:

- `packages/provenance-core/src/scanner/lexicalNormalize.ts`

Existing PoryGen behavior collapses developer-chosen identifiers and literals while preserving keywords/punctuation so variable renaming and formatting changes have less effect.

V2 deliberately keeps **two** signals. The preserving representation keeps identifier names and literal spelling; the normalized representation collapses identifiers to `ID` and supported literals to `LIT`. JavaScript private identifiers such as `#head` are tokenized as identifiers rather than Python-style comments. Python single-, double-, and triple-quoted strings are treated as literals.

V2 mapping:

- `lib/search.mjs` tokenizer section — language-specific lexical tokenization plus preserving/normalized output.
- `lib/search.mjs` reference-index builder — build both representations into the public reference index.

JavaScript and TypeScript are treated as compatible candidate languages. Python remains Python-only.

Classification: **direct internal design precedent**.

---

## 4. Inverted retrieval and rarity weighting

Concept reference:

Christopher D. Manning, Prabhakar Raghavan, Hinrich Schütze, *Introduction to Information Retrieval*.

- Inverted indexes: https://nlp.stanford.edu/IR-book/html/htmledition/a-first-take-at-building-an-inverted-index-1.html
- IDF intuition: https://nlp.stanford.edu/IR-book/html/htmledition/inverse-document-frequency-1.html

V2 mapping:

- `lib/search.mjs:156-197` — prebuild fingerprint postings.
- `lib/search.mjs` candidate retrieval — query postings from both representations, filter to compatible languages, combine candidate lists, calculate an IDF-like weight, and downweight fingerprints common across much of the corpus. Each query fingerprint contributes at most once per candidate document; repeated occurrences remain only as location evidence.

The exact weighting rule and 0.60 common-fingerprint cutoff are **original experimental lab heuristics**, not implementations from the text.

---

## 5. Ordered token verification

Concept reference:

NIST Dictionary of Algorithms and Data Structures — **Longest Common Subsequence**:

https://xlinux.nist.gov/dads/HTML/longestCommonSubsequence.html

V2 uses two order-aware measurements:

- longest common subsequence length to estimate order-preserving coverage;
- longest common contiguous token block to anchor actual matching lines.

V2 mapping:

- `lib/search.mjs:295-312` — rolling-row LCS length.
- `lib/search.mjs:314-342` — longest contiguous token block.
- `lib/search.mjs:368-407` — separate customer/source coverage and experimental evidence gate.

The code is an original lab implementation of standard dynamic-programming concepts.

---

## 6. GitHub repository retrieval

References:

GitHub REST API:

- Repositories: https://docs.github.com/en/rest/repos/repos#get-a-repository
- Commits: https://docs.github.com/en/rest/commits/commits#get-a-commit
- Git trees: https://docs.github.com/en/rest/git/trees#get-a-tree
- Git blobs: https://docs.github.com/en/rest/git/blobs#get-a-blob

V2 mapping:

- `lib/github-source.mjs:3-10` — resource limits.
- `lib/github-source.mjs:16-34` — strict `https://github.com/owner/repo` parsing.
- `lib/github-source.mjs:46-59` — bounded GitHub API JSON request.
- `lib/github-source.mjs:73+` — resolve commit/tree, filter supported files, fetch blobs.

The lab constructs its own GitHub API URLs. It does not accept arbitrary customer-supplied fetch destinations.

---

## 7. HTTP privacy behavior

References:

- OWASP ASVS 5.0 General Data Protection: https://cornucopia.owasp.org/taxonomy/asvs-5.0/14-data-protection/02-general-data-protection
- MDN Cache-Control: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control
- OWASP MASWE-0005: https://mas.owasp.org/MASWE/MASVS-STORAGE/MASWE-0005/

V2 mapping:

- `server.mjs:22-31` — `no-store`, no-cache, no-referrer response headers.
- `server.mjs:52-112` — POST-body scan input and result generation.
- `server.mjs:134+` — POST-only `/api/scan`.
- `public/app.js:163+` — browser POST with `cache: "no-store"`.

The lab does not send customer source to a public web-search provider.

---

# Public reference corpus

The following source is intentionally stored as **reference data** in the V2 index.

## sindresorhus/yocto-queue

Commit:

`72a8fa96a9d389765cdf2bb9c6daba8302fc375d`

Indexed file:

- `index.js`
- blob `627ed535f3163b37f2e3b208a23788fd0a715eba`
- source: https://github.com/sindresorhus/yocto-queue/blob/72a8fa96a9d389765cdf2bb9c6daba8302fc375d/index.js
- license metadata: MIT
- license: https://github.com/sindresorhus/yocto-queue/blob/72a8fa96a9d389765cdf2bb9c6daba8302fc375d/license

## date-fns/date-fns

Commit:

`18cbd436f1428d0f45f89f710df65f62546c42f0`

Indexed files:

- `pkgs/core/src/addBusinessDays/index.ts` — blob `5199659960a152c310456b8de0e465fb015ece43`
- `pkgs/core/src/addDays/index.ts` — blob `0b623dbff124a9f59d7cfab1c1117d1ac8e04e84`
- `pkgs/core/src/_lib/normalizeInterval/index.ts` — blob `4f80ca8628c1ca9ca5e531cb4dc4bc608142c191`

Pinned source root:

https://github.com/date-fns/date-fns/tree/18cbd436f1428d0f45f89f710df65f62546c42f0/pkgs/core/src

License metadata: MIT

https://github.com/date-fns/date-fns/blob/18cbd436f1428d0f45f89f710df65f62546c42f0/pkgs/core/LICENSE.md

## psf/requests

Commit:

`611c6162cbc4ac2020a2f91c7cfa4f3abf9bbb60`

Indexed files:

- `src/requests/structures.py` — blob `7675eaf15a181dada66c02bb0468dc00d6f523b3`
- `src/requests/hooks.py` — blob `11ff9e9f27e76f5ef6b9b609e88c2f418d655e16`

Pinned source root:

https://github.com/psf/requests/tree/611c6162cbc4ac2020a2f91c7cfa4f3abf9bbb60/src/requests

License metadata: Apache-2.0

https://github.com/psf/requests/blob/611c6162cbc4ac2020a2f91c7cfa4f3abf9bbb60/LICENSE

---

# Reference-index construction

`config/reference-sources.json` is the human-readable manifest.

`scripts/build-index.mjs:21+` fetches only the configured pinned blobs and verifies the expected blob SHA.

`scripts/build-index.mjs:44+` calls the lab's index builder and writes `data/reference-index.json`.

The customer scan reads this prebuilt index. It does not rebuild it.

---

# Original V2 choices

These choices were created for the PoryGen experiment and should not be attributed to an external source:

- dual identifier-preserving + identifier-normalized indexes;
- 7-token shingles with a Winnowing window of 4 for V2;
- approximately 120-token overlapping regions with 60-token stride;
- union of both candidate lists;
- shortlist of 20 candidates per region;
- IDF-like downweighting of corpus-common fingerprints;
- LCS plus contiguous-span confirmation;
- starting gates of 24 ordered tokens, 12 contiguous tokens, and 60% smaller-side coverage;
- common-pattern softening;
- three customer-facing classes;
- browser-memory-only dismissal behavior;
- rescan comparison against the newly resolved repository commit.

Those are experimental settings, not validated probabilities or proof of provenance.
