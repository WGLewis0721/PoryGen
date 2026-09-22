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

## Status (2026-09-21)

A full build indexed 50,633 files from 1,017 packages in about 3.5 minutes. The pack is **not deployed**:
the matcher's strong-match gate was tuned against 6 reference files, and against 1,000 files it
passes generic 2–3 line snippets (for example, an axios helper reported as matching `qs`). Once that
gate is recalibrated, commit nothing: run `npm run index:build`, and `api/scan.mjs` loads
`corpus-pack.json` automatically whenever it's present in the deployment.
