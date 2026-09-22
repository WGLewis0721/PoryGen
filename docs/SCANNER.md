# Scanner

## Live scanner

The production MVP scanner is Source Search V2, exposed through `POST /api/scan`.

The main implementation lives under:

```
labs/source-search-lab/
  lib/github-source.mjs
  lib/scan-service.mjs
  lib/search.mjs
  data/reference-index.json
```

The current location is historical: the engine was validated as an isolated lab before being wired into production. Once the public MVP stabilizes, these modules should move into a production package without changing behavior.

## Request flow

```
repository URL
  → validate github.com URL
  → resolve latest default-branch commit
  → fetch recursive Git tree
  → choose supported source files
  → fetch source text
  → tokenize
  → fingerprint
  → retrieve candidates
  → verify candidates
  → report strong / possible-common / abstain
```

The engine never executes repository code.

## Supported languages

- JavaScript
- TypeScript
- Python

JS and TS are treated as compatible for candidate matching. Python is compared within the Python language family.

## Token representations

The engine uses two representations.

### Preserving

Keeps identifier and literal spelling.

Examples include:

- `id:Queue`
- `id:#head`
- `lit:"safe"`

This representation provides source-specific evidence.

### Normalized

Collapses identifiers and literals while preserving structural tokens.

This makes candidate retrieval robust to renaming, formatting, and some literal changes.

Normalized structure is useful for **finding candidates** but is not sufficient by itself for a strong customer-facing source attribution.

## Fingerprinting and retrieval

Current settings are stored with the reference index.

Key defaults:

- 7-token shingles;
- Winnowing window 4;
- 120-token regions;
- 60-token region stride;
- 20-candidate shortlist per region.

The inverted index maps fingerprint hashes to candidate documents.

Corpus-common fingerprints are downweighted.

Each query fingerprint contributes at most once to a candidate retrieval score so repeated occurrences cannot artificially inflate ranking.

## Verification

Candidates are verified using ordered token matching and longest contiguous spans.

Evidence includes:

- matched token count;
- longest contiguous matched run;
- customer-region coverage;
- source-region coverage;
- customer line range;
- source line range;
- excerpts.

## Reporting gate

The engine separates **retrieval confidence** from **reporting confidence**.

A strong match requires all of the following kinds of support:

- substantial normalized structural overlap;
- sufficient ordered/contiguous overlap;
- sufficient smaller-side coverage;
- low enough corpus-common evidence;
- meaningful source-specific evidence.

Source-specific evidence comes from preserving-token overlap and/or rare preserving fingerprints.

This prevents ordinary same-shape implementations from becoming strong attributions.

### Outcomes

**Strong match**  
The evidence is specific enough to surface the public source for review.

**Possible / common pattern**  
There is meaningful similarity, but the evidence may be explained by ordinary structure or insufficiently unique code.

**Insufficient evidence / abstention**  
Nothing is specific enough to justify naming a source.

Multiple public sources may independently earn strong status. The engine does not force one winner.

## Duplicate evidence

Overlapping customer regions that identify the same public source are collapsed into one coherent finding rather than repeated customer-facing cards.

## Reference corpus

The live index currently contains 6 pinned files from 3 public repositories:

| Repository | Language |
|---|---|
| `sindresorhus/yocto-queue` | JavaScript |
| `date-fns/date-fns` | TypeScript |
| `psf/requests` | Python |

Every entry is pinned to a commit and has source/license metadata.

This is intentionally small MVP coverage.

A clean result means:

> no sufficiently specific match was found in this index.

It does not mean:

> the code is original.

## GitHub ingestion

`github-source.mjs` accepts only public HTTPS GitHub repository URLs.

It uses GitHub REST for:

- repository metadata;
- default-branch commit;
- recursive tree.

Source content is fetched from `raw.githubusercontent.com`, which avoids consuming one REST API request per source file.

A configured server-side `GITHUB_TOKEN` increases GitHub REST capacity.

## Limits

Current production limits:

- 40 fetched supported files;
- 100 KB per file;
- 750 KB total source;
- 15-second fetch budget;
- up to 40 detailed skip records.

Excluded directory names include common vendor, build, generated, virtual-environment, and dependency directories.

## Completeness

Completeness accounting is separate from the visible skipped-file list.

Incomplete reasons include:

- file too large;
- decoded file too large;
- provider/download failure;
- time limit;
- file limit;
- total-byte limit.

The UI shows a partial-scan warning when appropriate.

## Safe rescan resolution

The public scanner can compare the previous browser-stored scan with a new scan.

A previous finding only counts as resolved when:

- its file was successfully rechecked; or
- the new Git tree is complete and proves the file no longer exists.

If a partial scan simply did not reach the file, PoryGen does not claim it was fixed.

## Privacy behavior

The public request path is POST-only and uses no-store responses.

Customer source is fetched for the scan and held transiently in request memory. The public MVP does not persist source files or findings server-side.

The browser may store the last scan response and review/dismiss decisions in local storage for that repository.

## Validation status

The V2 engine has regression coverage for retrieval, reporting, completeness, rescan safety, tokenizer edge cases, index freshness, and a live GitHub fixture.

The product is now in the phase where real user behavior should drive matcher changes. Do not reopen open-ended threshold research unless production use exposes a concrete failure.

## Future scanner work

See [ROADMAP.md](../ROADMAP.md).

The important next technical steps are:

1. expand source coverage;
2. move stable production code out of `labs/`;
3. support durable connected-repo state;
4. add async workers for larger repositories;
5. add automatic GitHub change scanning.
