# @porygen/source-index

Offline pipeline that builds PoryGen's public reference corpus. It runs locally or in CI,
never in the request path.

```bash
npm run index:build            # from the repo root: seed → fetch → … → export
node packages/source-index/cli.mjs stats
```

| Stage | What it does |
| --- | --- |
| `seed` | Popular projects: npm by downloads (wooorm/npm-high-impact), PyPI by downloads (hugovk/top-pypi-packages). |
| `fetch` | For each project's latest release: registry metadata, archive download, **integrity check**, file selection (JS/TS/Py, ≤100 KB, no minified/generated/`.d.ts`/vendored dirs), storage. Resumable. |
| `downloads` | npm monthly downloads (authority signal; PyPI counts come with the seed). |
| `frequencies` | Global fingerprint frequencies, counted per dedup cluster and per project. |
| `rank` | Picks the likely upstream occurrence of every cluster ([lib/rank.mjs](lib/rank.mjs)). |
| `export` | Writes `labs/source-search-lab/data/corpus-pack.json` for the scanner. |

**Canonical metadata** per release: ecosystem, name, exact version, SPDX license (normalized from
npm fields, SPDX expressions and PyPI trove classifiers) with a permissive / copyleft / unknown
family, repository, first-publish date, version-publish date, archive URL and integrity hash.

**Deduplication** has two levels: `exact_hash` (the same bytes, modulo line endings) stores one blob
for every place it was published, and `shape_hash` (the same token stream with comments and
formatting dropped) groups reformatted copies into one cluster.

**Global fingerprint frequencies** are counted once per cluster, so vendored and re-published copies
don't inflate them. The export turns fingerprints above a corpus-wide threshold into a stoplist,
which the scanner removes from its postings.

**Upstream ranking**: each occurrence of a cluster gets interpretable features (origin by first-publish
date, download authority, path naming the package, primary source location, and penalties for build
output, tests and vendored paths). A weighted score plus a per-cluster softmax gives
`rank_probability`. The weights are priors in one object, so they can be refit from labeled pairs.

**Serving.** The corpus DB (`data/corpus.db`, gitignored) holds the full corpus. The scanner serves
the exported pack: the top canonical, non-test files (default 1,000, at most 8 per package; ~13 MB, ~2 s cold start). The
matcher is unchanged, because `referenceIndexFromPack` rebuilds tokens and postings with it and
then applies the stoplist. Serving the whole corpus needs a retrieval service over `corpus.db`,
which is the next step.

## Shipping the corpus

`export` writes two files:

- `corpus-manifest.json` is **committed**. It lists packages, exact versions, archive URLs, integrity
  hashes, file paths and content hashes, plus the global stoplist (numbers only). It contains no
  third-party source code.
- `corpus-pack.json` is gitignored. It's the manifest with file contents.

On Vercel, `vercel-build` runs [hydrate.mjs](hydrate.mjs) first. It re-downloads the pinned archives from
npm and PyPI, verifies each archive's integrity and each file's content hash, and writes the pack
into the deployment. It fails the build if more than 10% of files can't be fetched. That takes
about 12 seconds for 1,000 files.

To refresh the corpus, run `npm run index:build`, then commit `corpus-manifest.json`.

## Strong-match calibration (2026-09-22)

The matcher's strong gate was recalibrated against this corpus (`minStrongContiguousTokens`,
`minRenamedCopyContiguousTokens` and `minRenamedCopyDistinctKinds` in
[search.mjs](../../labs/source-search-lab/lib/search.mjs)). On 15 real repositories, all 10 observed false
positives were removed and every true copy was kept. False positives peaked at 29 contiguous
normalized tokens and 6 contiguous exact identifiers; true copies started at 32 and 9.
